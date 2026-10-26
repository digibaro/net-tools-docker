<script setup lang="ts">
import { NAlert, NFormItem, NInputNumber } from 'naive-ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useQueryParam } from '@/composables/useQueryParam'
import CCard from '@/ui/c-card.vue'
import CKeyValueList from '@/ui/c-key-value-list.vue'
import { fixed } from '@/utils/format'
import { link } from './wireless-link-calculator.service'

const { t } = useI18n()
const q = {
  freqGHz: useQueryParam({ name: 'f', defaultValue: 5.8 }),
  distanceKm: useQueryParam({ name: 'd', defaultValue: 5 }),
  txDbm: useQueryParam({ name: 'tx', defaultValue: 20 }),
  txGainDbi: useQueryParam({ name: 'gtx', defaultValue: 23 }),
  rxGainDbi: useQueryParam({ name: 'grx', defaultValue: 23 }),
  cableLossDb: useQueryParam({ name: 'loss', defaultValue: 1 }),
  sensitivityDbm: useQueryParam({ name: 'sens', defaultValue: -78 }),
}
const fields = Object.keys(q) as (keyof typeof q)[]
const r = computed(() => link({ freqGHz: q.freqGHz.value, distanceKm: q.distanceKm.value, txDbm: q.txDbm.value, txGainDbi: q.txGainDbi.value, rxGainDbi: q.rxGainDbi.value, cableLossDb: q.cableLossDb.value, sensitivityDbm: q.sensitivityDbm.value }))
const k = (key: string) => t(`tools.wireless-link-calculator.fields.${key}`)
const rows = computed(() => [
  { label: k('fspl'), value: `${fixed(r.value.fsplDb, 1)} dB`, noCopy: true },
  { label: 'EIRP', value: `${fixed(r.value.eirpDbm, 1)} dBm`, noCopy: true },
  { label: k('rx'), value: `${fixed(r.value.rxDbm, 1)} dBm`, noCopy: true },
  { label: k('margin'), value: `${fixed(r.value.marginDb, 1)} dB`, noCopy: true },
  { label: k('fresnel'), value: `${fixed(r.value.fresnelM, 1)} m`, noCopy: true },
  { label: k('clearance'), value: `${fixed(r.value.clearanceM, 1)} m`, noCopy: true },
  { label: k('bulge'), value: `${fixed(r.value.bulgeM, 1)} m`, noCopy: true },
  { label: k('mast'), value: `${fixed(r.value.mastM, 1)} m`, noCopy: true },
])
const grade = computed(() => (r.value.marginDb >= 20 ? 'good' : r.value.marginDb >= 10 ? 'ok' : 'poor'))
</script>

<template>
  <CCard>
    <div class="grid gap-x-4 sm:grid-cols-4">
      <NFormItem v-for="f in fields" :key="f" :label="t(`tools.wireless-link-calculator.inputs.${f}`)" :show-feedback="false" class="mb-3">
        <NInputNumber v-model:value="q[f].value" :step="f === 'freqGHz' ? 0.1 : 1" :show-button="false" :input-props="{ 'aria-label': t(`tools.wireless-link-calculator.inputs.${f}`) }" />
      </NFormItem>
    </div>
  </CCard>
  <CCard :title="t('common.result')" data-testid="result">
    <NAlert :type="grade === 'good' ? 'success' : grade === 'ok' ? 'warning' : 'error'" class="mb-3" data-testid="verdict">
      {{ t(`tools.wireless-link-calculator.grade.${grade}`, { margin: fixed(r.marginDb, 1) }) }}
    </NAlert>
    <CKeyValueList :rows="rows" />
    <p class="mb-0 text-xs nt-muted">
      {{ t('tools.wireless-link-calculator.note') }}
    </p>
  </CCard>
</template>
