<script setup lang="ts">
import type { DnsLookup } from '../dns-lookup/dns-lookup.service'
import type { Inputs } from './dns-health-report.service'
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
import { dnsHealth } from './dns-health-report.service'

const { t } = useI18n()
const zone = useQueryParam({ name: 'zone', defaultValue: '' })
const validation = useValidation({ source: zone, rules: [{ validator: (s: string) => !s || isValidQueryName(s), message: t('tools.dns-lookup.invalidName') }] })
const inputs = shallowRef<Inputs>()
const loading = ref(false)
const ran = ref('')
function get<T>(path: string, q: Record<string, string>): Promise<T | undefined> {
  return apiGet<T>(`${path}${buildQuery(q)}`).catch(() => undefined)
}
async function run() {
  const z = zone.value.trim().replace(/\.$/, '')
  if (!z || !validation.value.isValid)
    return
  loading.value = true
  inputs.value = undefined
  const lookup = (type: string) => get<DnsLookup>('/v1/dns/lookup', { name: z, type, resolver: 'system' })
  const [consistency, dnssec, soa, caa, mx, edns] = await Promise.all([
    get<Inputs['consistency']>('/v1/dns/consistency', { zone: z }),
    get<Inputs['dnssec']>('/v1/dns/dnssec', { name: z, type: 'SOA' }),
    lookup('SOA'),
    lookup('CAA'),
    lookup('MX'),
    get<Inputs['edns']>('/v1/dns/edns-compliance', { zone: z }),
  ])
  inputs.value = { consistency, dnssec, soa, caa, mx, edns }
  ran.value = z
  loading.value = false
}
onMounted(() => {
  if (zone.value)
    void run()
})
const checks = computed(() => (inputs.value ? dnsHealth(inputs.value) : []))
</script>

<template>
  <CCard>
    <form class="contents" @submit.prevent="run">
      <CInputText v-model:value="zone" :label="t('tools.dns-health-report.zone')" placeholder="example.com" :validation="validation" monospace test-id="zone" />
      <NButton type="primary" attr-type="submit" :loading="loading" :disabled="!zone || !validation.isValid" data-testid="run">
        {{ t('tools.dns-health-report.run') }}
      </NButton>
      <p class="mb-0 text-xs nt-muted">
        {{ t('tools.dns-health-report.note') }}
      </p>
    </form>
  </CCard>
  <CCard v-if="inputs" :title="t('tools.dns-health-report.result', { zone: ran })" data-testid="result">
    <HealthReport :checks="checks" prefix="tools.dns-health-report" :title="t('tools.dns-health-report.result', { zone: ran })" filename="dns-health.json" />
  </CCard>
</template>
