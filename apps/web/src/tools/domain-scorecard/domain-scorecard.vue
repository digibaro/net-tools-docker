<script setup lang="ts">
import type { Inputs as DnsInputs } from '../dns-health-report/dns-health-report.service'
import type { DnsLookup } from '../dns-lookup/dns-lookup.service'
import type { MailInputs } from '../email-deliverability-report/email-deliverability-report.service'
import type { Section, WebInputs } from './domain-scorecard.service'
import { NButton, NProgress, NTag } from 'naive-ui'
import { computed, onMounted, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { apiGet } from '@/api/client'
import { grade } from '@/components/health-report'
import HealthReport from '@/components/HealthReport.vue'
import { buildQuery } from '@/composables/useApi'
import { useQueryParam } from '@/composables/useQueryParam'
import { useValidation } from '@/composables/useValidation'
import CCard from '@/ui/c-card.vue'
import CInputText from '@/ui/c-input-text.vue'
import { limiter } from '@/utils/limit'
import { dnsHealth } from '../dns-health-report/dns-health-report.service'
import { isValidQueryName } from '../dns-lookup/dns-lookup.service'
import { deliverability } from '../email-deliverability-report/email-deliverability-report.service'
import { webChecks } from './domain-scorecard.service'

const { t } = useI18n()
const domain = useQueryParam({ name: 'domain', defaultValue: '' })
const validation = useValidation({ source: domain, rules: [{ validator: (s: string) => !s || isValidQueryName(s), message: t('tools.dns-lookup.invalidName') }] })
const loading = ref(false)
const done = ref(0)
const total = ref(0)
const ran = ref('')
const sections = shallowRef<Section[]>()

// The api runs at most 3 jobs per client at a time.
const limit = limiter(3)
function get<T>(path: string, q: Record<string, string>): Promise<T | undefined> {
  total.value++
  return limit(() => apiGet<T>(`${path}${buildQuery(q)}`))
    .catch(() => undefined)
    .finally(() => done.value++)
}

async function run() {
  const d = domain.value.trim().replace(/\.$/, '').toLowerCase()
  if (!d || !validation.value.isValid)
    return
  loading.value = true
  sections.value = undefined
  done.value = 0
  total.value = 0
  const site = `https://${d}/`
  // Web first (what most people look at), then mail, then DNS.
  const [tls, headers, redirects, protocols, ipv6, spf, dmarc, mtasts, mx, dane, consistency, dnssec, soa, caa] = await Promise.all([
    get<WebInputs['tls']>('/v1/tls/inspect', { host: d }),
    get<WebInputs['headers']>('/v1/http/security-headers', { url: site }),
    get<WebInputs['redirects']>('/v1/http/redirects', { url: `http://${d}/` }),
    get<WebInputs['protocols']>('/v1/http/protocols', { url: site }),
    get<WebInputs['ipv6']>('/v1/ipv6/readiness', { domain: d }),
    get<MailInputs['spf']>('/v1/email/spf', { domain: d }),
    get<MailInputs['dmarc']>('/v1/email/dmarc', { domain: d }),
    get<MailInputs['mtasts']>('/v1/email/mtasts', { domain: d }),
    get<MailInputs['mx']>('/v1/email/mx', { domain: d }),
    get<MailInputs['dane']>('/v1/tls/dane', { host: d, service: 'smtp' }),
    get<DnsInputs['consistency']>('/v1/dns/consistency', { zone: d }),
    get<DnsInputs['dnssec']>('/v1/dns/dnssec', { name: d, type: 'SOA' }),
    get<DnsLookup>('/v1/dns/lookup', { name: d, type: 'SOA', resolver: 'system' }),
    get<DnsLookup>('/v1/dns/lookup', { name: d, type: 'CAA', resolver: 'system' }),
  ])
  // DKIM needs a selector and FCrDNS a port-25 probe: both live in the email deliverability report.
  const mail = deliverability({ spf, dmarc, mtasts, mx, dane, selector: '' }).filter(c => c.id !== 'dkim')
  sections.value = [
    { id: 'web', prefix: 'tools.domain-scorecard', checks: webChecks({ tls, headers, redirects, protocols, ipv6 }) },
    { id: 'mail', prefix: 'tools.email-deliverability-report', checks: mail },
    { id: 'dns', prefix: 'tools.dns-health-report', checks: dnsHealth({ consistency, dnssec, soa, caa }) },
  ]
  ran.value = d
  loading.value = false
}
onMounted(() => {
  if (domain.value)
    void run()
})
const overall = computed(() => (sections.value ? grade(sections.value.flatMap(s => s.checks)) : undefined))
const tagType = { A: 'success', B: 'success', C: 'warning', D: 'error', F: 'error' } as const
const sectionTitle = (s: Section) => t(`tools.domain-scorecard.sections.${s.id}`)
</script>

<template>
  <CCard>
    <form class="contents" @submit.prevent="run">
      <CInputText v-model:value="domain" :label="t('email.domain')" placeholder="example.com" :validation="validation" monospace test-id="domain" />
      <NButton type="primary" attr-type="submit" :loading="loading" :disabled="!domain || !validation.isValid" data-testid="run">
        {{ t('tools.domain-scorecard.run') }}
      </NButton>
      <NProgress v-if="loading && total" class="mt-3" type="line" :percentage="Math.round((done / total) * 100)" :show-indicator="false" :aria-label="t('tools.domain-scorecard.progress', { done, total })" />
      <p class="mb-0 mt-2 text-xs nt-muted">
        {{ loading && total ? t('tools.domain-scorecard.progress', { done, total }) : t('tools.domain-scorecard.note') }}
      </p>
    </form>
  </CCard>
  <template v-if="sections && overall">
    <CCard :title="t('tools.domain-scorecard.result', { domain: ran })" data-testid="result">
      <div class="flex flex-wrap items-center gap-4">
        <NTag :type="tagType[overall.letter]" size="large" :bordered="false" data-testid="overall">
          {{ overall.letter }} · {{ overall.score }}/100
        </NTag>
        <span v-for="s in sections" :key="s.id" class="inline-flex items-center gap-2 text-sm">
          {{ sectionTitle(s) }}
          <NTag size="small" :type="tagType[grade(s.checks).letter]" :bordered="false">{{ grade(s.checks).letter }}</NTag>
        </span>
      </div>
    </CCard>
    <CCard v-for="s in sections" :key="s.id" :title="sectionTitle(s)" :data-testid="`section-${s.id}`">
      <HealthReport :checks="s.checks" :prefix="s.prefix" :title="`${sectionTitle(s)} — ${ran}`" :filename="`scorecard-${s.id}.json`" />
    </CCard>
  </template>
</template>
