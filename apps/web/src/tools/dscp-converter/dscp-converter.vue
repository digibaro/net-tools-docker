<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ResultTable from '@/components/ResultTable.vue'
import { useQueryParam } from '@/composables/useQueryParam'
import { useValidation } from '@/composables/useValidation'
import CCard from '@/ui/c-card.vue'
import CInputText from '@/ui/c-input-text.vue'
import CKeyValueList from '@/ui/c-key-value-list.vue'
import { describe, parse, PHBS, snippets } from './dscp-converter.service'

const { t } = useI18n()
const input = useQueryParam({ name: 'v', defaultValue: 'EF' })
const validation = useValidation({ source: input, rules: [{ validator: (s: string) => parse(s) !== undefined, message: t('tools.dscp-converter.invalid') }] })
const d = computed(() => {
  const v = parse(input.value)
  return v === undefined ? undefined : describe(v)
})
const k = (key: string) => t(`tools.dscp-converter.fields.${key}`)
const rows = computed(() => (d.value
  ? [
      { label: k('name'), value: d.value.name, mono: true },
      { label: 'DSCP', value: `${d.value.dscp} (${d.value.binary})`, mono: true },
      { label: k('tos'), value: `${d.value.tos} (${d.value.tosHex})`, mono: true },
      { label: k('precedence'), value: String(d.value.precedence), mono: true },
      { label: k('cos'), value: String(d.value.cos), mono: true },
      ...(d.value.drop ? [{ label: k('drop'), value: t(`tools.dscp-converter.drop.${d.value.drop}`), noCopy: true }] : []),
      { label: k('use'), value: t(`tools.dscp-converter.uses.${d.value.use}`), noCopy: true },
    ]
  : []))
const table = PHBS.map(p => ({ ...describe(p.dscp), use: t(`tools.dscp-converter.uses.${p.use}`) }))
</script>

<template>
  <CCard>
    <CInputText v-model:value="input" :label="t('tools.dscp-converter.input')" placeholder="EF, AF41, 46, 0xb8, tos 184" :validation="validation" monospace test-id="input" />
  </CCard>
  <CCard v-if="d" :title="d.name" data-testid="result">
    <CKeyValueList :rows="rows" />
    <h3 class="mb-2 mt-4 text-sm font-semibold">
      {{ t('tools.dscp-converter.snippets') }}
    </h3>
    <div v-for="s in snippets(d)" :key="s.platform" class="mb-2">
      <div class="text-xs nt-muted">
        {{ s.platform }}
      </div>
      <pre class="m-0 overflow-auto text-xs font-mono" tabindex="0">{{ s.config }}</pre>
    </div>
  </CCard>
  <CCard :title="t('tools.dscp-converter.table')">
    <ResultTable :columns="[{ key: 'name', title: k('name'), width: 130 }, { key: 'dscp', title: 'DSCP', width: 70 }, { key: 'binary', title: k('binary'), mono: true, width: 90 }, { key: 'tosHex', title: k('tos'), mono: true, width: 90 }, { key: 'precedence', title: k('precedence'), width: 90 }, { key: 'cos', title: 'CoS', width: 60 }, { key: 'use', title: k('use'), width: 220 }]" :rows="table" row-key="dscp" filename="dscp.json" />
  </CCard>
</template>
