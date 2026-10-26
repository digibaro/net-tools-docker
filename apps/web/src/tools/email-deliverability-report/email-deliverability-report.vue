<script setup lang="ts">
import type { MailInputs } from './email-deliverability-report.service'
import { NButton } from 'naive-ui'
import { computed, onMounted, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { apiGet } from '@/api/client'
import HealthReport from '@/components/HealthReport.vue'
import { buildQuery } from '@/composables/useApi'
import { useQueryParam } from '@/composables/useQueryParam'
import { useValidation } from '@/composables/useValidation'
import CCard from '@/ui/c-card.vue'
import CInputText from '@/ui/c-input-text.vue'
import { isValidQueryName } from '../dns-lookup/dns-lookup.service'
import { deliverability } from './email-deliverability-report.service'

const { t } = useI18n()
const domain = useQueryParam({ name: 'domain', defaultValue: '' })
const selector = useQueryParam({ name: 'selector', defaultValue: '' })
const validation = useValidation({ source: domain, rules: [{ validator: (s: string) => !s || isValidQueryName(s), message: t('tools.dns-lookup.invalidName') }] })
const inputs = shallowRef<MailInputs>()
const loading = ref(false)
const ran = ref('')
function get<T>(path: string, q: Record<string, string>): Promise<T | undefined> {
  return apiGet<T>(`${path}${buildQuery(q)}`).catch(() => undefined)
}
async function run() {
  const d = domain.value.trim().replace(/\.$/, '')
  if (!d || !validation.value.isValid)
    return
  loading.value = true
  inputs.value = undefined
  const sel = selector.value.trim()
  const [spf, dmarc, mtasts, mx, dkim, dane, banner] = await Promise.all([
    get<MailInputs['spf']>('/v1/email/spf', { domain: d }),
    get<MailInputs['dmarc']>('/v1/email/dmarc', { domain: d }),
    get<MailInputs['mtasts']>('/v1/email/mtasts', { domain: d }),
    get<MailInputs['mx']>('/v1/email/mx', { domain: d }),
    sel ? get<MailInputs['dkim']>('/v1/email/dkim', { domain: d, selector: sel }) : Promise.resolve(undefined),
    get<MailInputs['dane']>('/v1/tls/dane', { host: d, service: 'smtp' }),
    get<MailInputs['banner']>('/v1/email/smtp-banner', { host: d }),
  ])
  inputs.value = { spf, dmarc, mtasts, mx, dkim, dane, banner, selector: sel }
  ran.value = d
  loading.value = false
}
onMounted(() => {
  if (domain.value)
    void run()
})
const checks = computed(() => (inputs.value ? deliverability(inputs.value) : []))
</script>

<template>
  <CCard>
    <form class="contents" @submit.prevent="run">
      <div class="grid gap-x-4 sm:grid-cols-[1fr_12rem]">
        <CInputText v-model:value="domain" :label="t('tools.email-deliverability-report.domain')" placeholder="example.com" :validation="validation" monospace test-id="domain" />
        <CInputText v-model:value="selector" :label="t('tools.email-deliverability-report.selector')" placeholder="selector1" monospace test-id="selector" />
      </div>
      <NButton type="primary" attr-type="submit" :loading="loading" :disabled="!domain || !validation.isValid" data-testid="run">
        {{ t('tools.email-deliverability-report.run') }}
      </NButton>
      <p class="mb-0 text-xs nt-muted">
        {{ t('tools.email-deliverability-report.note') }}
      </p>
    </form>
  </CCard>
  <CCard v-if="inputs" :title="t('tools.email-deliverability-report.result', { domain: ran })" data-testid="result">
    <HealthReport :checks="checks" prefix="tools.email-deliverability-report" :title="t('tools.email-deliverability-report.result', { domain: ran })" filename="email-deliverability.json" />
  </CCard>
</template>
