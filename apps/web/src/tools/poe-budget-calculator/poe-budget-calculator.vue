<script setup lang="ts">
import { NAlert, NFormItem, NInput, NInputNumber, NProgress, NRadioButton, NRadioGroup } from 'naive-ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ResultTable from '@/components/ResultTable.vue'
import { useQueryParam } from '@/composables/useQueryParam'
import CCard from '@/ui/c-card.vue'
import CKeyValueList from '@/ui/c-key-value-list.vue'
import { budget, CLASSES, parseDevices } from './poe-budget-calculator.service'

const { t } = useI18n()
const available = useQueryParam({ name: 'budget', defaultValue: 370 })
const mode = useQueryParam({ name: 'mode', defaultValue: 'class' })
const text = useQueryParam({ name: 'devices', defaultValue: 'Access point, 4, 6\nCamera, 3, 10\nDesk phone, 2, 20' })
const devices = computed(() => parseDevices(text.value))
const b = computed(() => budget(devices.value, available.value, mode.value as 'class' | 'lldp'))
const k = (key: string) => t(`tools.poe-budget-calculator.fields.${key}`)
const rows = computed(() => [
  { label: k('ports'), value: String(b.value.ports), noCopy: true },
  { label: k('allocated'), value: `${b.value.allocated} W (${b.value.pct} %)`, noCopy: true },
  { label: k('drawn'), value: `${b.value.drawn} W`, noCopy: true },
  { label: k('remaining'), value: `${b.value.remaining} W`, noCopy: true },
])
const classRows = CLASSES.map(c => ({ ...c, id: c.id }))
</script>

<template>
  <CCard>
    <div class="flex flex-wrap items-end gap-x-6">
      <NFormItem :label="t('tools.poe-budget-calculator.budget')" :show-feedback="false" class="mb-3 w-44">
        <NInputNumber v-model:value="available" :min="0" :show-button="false" :input-props="{ 'aria-label': t('tools.poe-budget-calculator.budget') }" />
      </NFormItem>
      <NRadioGroup v-model:value="mode" name="mode" class="mb-3">
        <NRadioButton value="class" :label="t('tools.poe-budget-calculator.modes.class')" />
        <NRadioButton value="lldp" :label="t('tools.poe-budget-calculator.modes.lldp')" />
      </NRadioGroup>
    </div>
    <NFormItem :label="t('tools.poe-budget-calculator.devices')" :show-feedback="false" class="mb-1">
      <NInput v-model:value="text" type="textarea" :rows="5" class="font-mono" :input-props="{ 'aria-label': t('tools.poe-budget-calculator.devices') }" data-testid="devices" />
    </NFormItem>
    <p class="m-0 text-xs nt-muted">
      {{ t('tools.poe-budget-calculator.help') }}
    </p>
  </CCard>
  <CCard :title="t('common.result')" data-testid="result">
    <NAlert :type="b.over ? 'error' : b.pct > 80 ? 'warning' : 'success'" class="mb-3" data-testid="verdict">
      {{ t(b.over ? 'tools.poe-budget-calculator.over' : 'tools.poe-budget-calculator.fits', { pct: b.pct }) }}
    </NAlert>
    <NProgress type="line" :percentage="Math.min(100, b.pct)" :status="b.over ? 'error' : 'default'" :show-indicator="false" :aria-label="k('allocated')" class="mb-3 max-w-md" />
    <CKeyValueList :rows="rows" />
  </CCard>
  <CCard :title="t('tools.poe-budget-calculator.classes')">
    <ResultTable :columns="[{ key: 'id', title: t('tools.poe-budget-calculator.cls'), width: 70 }, { key: 'standard', title: 'Standard', width: 220 }, { key: 'pse', title: k('pse'), width: 120 }, { key: 'pd', title: k('pd'), width: 120 }]" :rows="classRows" row-key="id" :actions="false" :label="t('tools.poe-budget-calculator.classes')" />
  </CCard>
</template>
