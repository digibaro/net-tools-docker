<script setup lang="ts">
import { NAlert, NFormItem, NInput, NSwitch } from 'naive-ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ResultTable from '@/components/ResultTable.vue'
import { useQueryParam } from '@/composables/useQueryParam'
import CCard from '@/ui/c-card.vue'
import { findOverlaps, parseEntries } from './subnet-overlap-checker.service'

const { t } = useI18n()
const text = useQueryParam({ name: 'p', defaultValue: '# Head office\n10.10.0.0/16\n192.168.1.0/24\n# Branch\n10.10.40.0/24\n192.168.1.0/24\n# Cloud VPC\n10.20.0.0/16' })
const same = useQueryParam({ name: 'same', defaultValue: false })
const parsed = computed(() => parseEntries(text.value))
const overlaps = computed(() => findOverlaps(parsed.value.entries, same.value))
const k = (key: string) => t(`tools.subnet-overlap-checker.columns.${key}`)
const rows = computed(() => overlaps.value.map((o, i) => ({ id: String(i), a: o.a.text, aLabel: o.a.label || '—', relation: t(`tools.subnet-overlap-checker.relations.${o.relation}`), b: o.b.text, bLabel: o.b.label || '—', lines: `${o.a.line}, ${o.b.line}` })))
</script>

<template>
  <CCard>
    <NFormItem :label="t('tools.subnet-overlap-checker.input')" :show-feedback="false" class="mb-1">
      <NInput v-model:value="text" type="textarea" :autosize="{ minRows: 6, maxRows: 18 }" class="font-mono" :input-props="{ 'aria-label': t('tools.subnet-overlap-checker.input') }" data-testid="input" />
    </NFormItem>
    <p class="mb-3 mt-0 text-xs nt-muted">
      {{ t('tools.subnet-overlap-checker.help') }}
    </p>
    <label class="flex items-center gap-2 text-sm">
      <NSwitch v-model:value="same" size="small" :aria-label="t('tools.subnet-overlap-checker.same')" />
      {{ t('tools.subnet-overlap-checker.same') }}
    </label>
  </CCard>
  <CCard :title="t('common.result')" data-testid="result">
    <NAlert :type="overlaps.length ? 'warning' : 'success'" class="mb-3" data-testid="verdict">
      {{ overlaps.length ? t('tools.subnet-overlap-checker.found', { n: overlaps.length, total: parsed.entries.length }) : t('tools.subnet-overlap-checker.none', { total: parsed.entries.length }) }}
    </NAlert>
    <NAlert v-if="parsed.invalid.length" type="info" class="mb-3">
      {{ t('tools.subnet-overlap-checker.invalid', { lines: parsed.invalid.join(', ') }) }}
    </NAlert>
    <ResultTable v-if="rows.length" :columns="[{ key: 'a', title: k('a'), mono: true, width: 190 }, { key: 'aLabel', title: k('label'), width: 140 }, { key: 'relation', title: k('relation'), width: 120 }, { key: 'b', title: k('b'), mono: true, width: 190 }, { key: 'bLabel', title: k('label'), width: 140 }, { key: 'lines', title: k('lines'), width: 80 }]" :rows="rows" row-key="id" filename="overlaps.json" />
  </CCard>
</template>
