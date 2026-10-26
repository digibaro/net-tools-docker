<script setup lang="ts">
import { NAlert, NFormItem, NInputNumber } from 'naive-ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useQueryParam } from '@/composables/useQueryParam'
import CCard from '@/ui/c-card.vue'
import CKeyValueList from '@/ui/c-key-value-list.vue'
import { fixed } from '@/utils/format'
import { deterministic, natCapacity } from './nat-capacity-calculator.service'

const { t } = useI18n()
const q = {
  subscribers: useQueryParam({ name: 'subs', defaultValue: 1000 }),
  sessionsPerSubscriber: useQueryParam({ name: 'sessions', defaultValue: 300 }),
  publicIps: useQueryParam({ name: 'ips', defaultValue: 16 }),
  portLow: useQueryParam({ name: 'low', defaultValue: 1024 }),
  portHigh: useQueryParam({ name: 'high', defaultValue: 65535 }),
  blockSize: useQueryParam({ name: 'block', defaultValue: 1024 }),
}
const lookup = useQueryParam({ name: 'n', defaultValue: 0 })
const input = computed(() => ({ subscribers: q.subscribers.value, sessionsPerSubscriber: q.sessionsPerSubscriber.value, publicIps: q.publicIps.value, portLow: q.portLow.value, portHigh: q.portHigh.value, blockSize: q.blockSize.value }))
const r = computed(() => natCapacity(input.value))
const slot = computed(() => deterministic(input.value, lookup.value))
const k = (key: string) => t(`tools.nat-capacity-calculator.fields.${key}`)
const rows = computed(() => [
  { label: k('portsPerIp'), value: String(r.value.portsPerIp), noCopy: true },
  { label: k('needed'), value: `${r.value.needed} / ${r.value.totalPorts} (${fixed(r.value.utilisation, 1)} %)`, noCopy: true },
  { label: k('perIp'), value: String(r.value.subscribersPerIp), noCopy: true },
  { label: k('max'), value: String(r.value.maxSubscribers), noCopy: true },
  { label: k('ipsNeeded'), value: Number.isFinite(r.value.ipsNeeded) ? String(r.value.ipsNeeded) : '—', noCopy: true },
])
const fields = ['subscribers', 'sessionsPerSubscriber', 'publicIps', 'portLow', 'portHigh', 'blockSize'] as const
</script>

<template>
  <CCard>
    <div class="grid gap-x-4 sm:grid-cols-3">
      <NFormItem v-for="f in fields" :key="f" :label="t(`tools.nat-capacity-calculator.inputs.${f}`)" :show-feedback="false" class="mb-3">
        <NInputNumber v-model:value="q[f].value" :min="0" :max="f.startsWith('port') ? 65535 : undefined" :show-button="false" :input-props="{ 'aria-label': t(`tools.nat-capacity-calculator.inputs.${f}`) }" />
      </NFormItem>
    </div>
  </CCard>
  <CCard :title="t('common.result')" data-testid="result">
    <NAlert :type="r.fits ? 'success' : 'error'" class="mb-3" data-testid="verdict">
      {{ t(r.fits ? 'tools.nat-capacity-calculator.fits' : 'tools.nat-capacity-calculator.short', { ips: Number.isFinite(r.ipsNeeded) ? r.ipsNeeded : '∞' }) }}
    </NAlert>
    <CKeyValueList :rows="rows" />
  </CCard>
  <CCard :title="t('tools.nat-capacity-calculator.deterministic')">
    <NFormItem :label="t('tools.nat-capacity-calculator.subscriber')" :show-feedback="false" class="mb-3 w-44">
      <NInputNumber v-model:value="lookup" :min="0" :show-button="false" :input-props="{ 'aria-label': t('tools.nat-capacity-calculator.subscriber') }" />
    </NFormItem>
    <p class="m-0 font-mono" data-testid="slot">
      {{ slot ? t('tools.nat-capacity-calculator.slot', { ip: slot.ip + 1, from: slot.from, to: slot.to }) : t('tools.nat-capacity-calculator.noSlot') }}
    </p>
  </CCard>
</template>
