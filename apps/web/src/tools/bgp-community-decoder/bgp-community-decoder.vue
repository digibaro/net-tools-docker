<script setup lang="ts">
import { NFormItem, NInput } from 'naive-ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ResultTable from '@/components/ResultTable.vue'
import { useQueryParam } from '@/composables/useQueryParam'
import CCard from '@/ui/c-card.vue'
import { decodeAll } from './bgp-community-decoder.service'

const { t } = useI18n()
const text = useQueryParam({ name: 'c', defaultValue: 'Community: 3356:2 65535:65281 0:64500\nLarge Community: 6695:0:13335 64512:1:100\nExtended Community: rt:65000:100' })
const rows = computed(() => decodeAll(text.value).map((d, i) => ({ id: String(i), input: d.input, kind: t(`tools.bgp-community-decoder.kinds.${d.kind}`), value: d.value, meaning: d.meaning, detail: d.detail })))
const k = (key: string) => t(`tools.bgp-community-decoder.columns.${key}`)
</script>

<template>
  <CCard>
    <NFormItem :label="t('tools.bgp-community-decoder.input')" :show-feedback="false" class="mb-1">
      <NInput v-model:value="text" type="textarea" :autosize="{ minRows: 3, maxRows: 12 }" class="font-mono" :input-props="{ 'aria-label': t('tools.bgp-community-decoder.input') }" data-testid="input" />
    </NFormItem>
    <p class="m-0 text-xs nt-muted">
      {{ t('tools.bgp-community-decoder.help') }}
    </p>
  </CCard>
  <CCard :title="t('common.result')" data-testid="result">
    <ResultTable :columns="[{ key: 'input', title: k('input'), mono: true, width: 170 }, { key: 'kind', title: k('kind'), width: 100 }, { key: 'value', title: k('value'), mono: true, width: 150 }, { key: 'meaning', title: k('meaning'), width: 300 }, { key: 'detail', title: k('detail'), width: 360 }]" :rows="rows" row-key="id" filename="communities.json" />
  </CCard>
</template>
