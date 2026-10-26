<script setup lang="ts">
import { NAlert, NFormItem, NInput } from 'naive-ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ResultTable from '@/components/ResultTable.vue'
import { useQueryParam } from '@/composables/useQueryParam'
import CCard from '@/ui/c-card.vue'
import { cidrToString, parseCidr } from '@/utils/ip'
import { evaluate, parseLists } from './prefix-list-tester.service'

const { t } = useI18n()
const config = useQueryParam({ name: 'pl', defaultValue: 'ip prefix-list CUSTOMER seq 5 deny 10.0.0.0/8 le 32\nip prefix-list CUSTOMER seq 10 permit 192.0.2.0/24\nip prefix-list CUSTOMER seq 20 permit 198.51.100.0/22 ge 23 le 24' })
const routes = useQueryParam({ name: 'routes', defaultValue: '192.0.2.0/24\n192.0.2.128/25\n198.51.100.0/23\n198.51.100.0/22\n10.20.0.0/16' })
const parsed = computed(() => parseLists(config.value))
const rows = computed(() => routes.value.split(/[\s,]+/).filter(Boolean).flatMap((s, i) => {
  const c = parseCidr(s, { allowBare: false })
  if (!c)
    return [{ id: `${i}`, route: s, list: '—', result: t('tools.prefix-list-tester.invalidRoute'), entry: '' }]
  return evaluate(parsed.value.entries, c).map(m => ({ id: `${i}${m.list}`, route: cidrToString(c), list: m.list, result: t(`tools.prefix-list-tester.results.${m.result}`), entry: m.entry ? m.entry.text : t('tools.prefix-list-tester.implicit') }))
}))
const k = (key: string) => t(`tools.prefix-list-tester.columns.${key}`)
</script>

<template>
  <CCard>
    <NFormItem :label="t('tools.prefix-list-tester.config')" :show-feedback="false" class="mb-1">
      <NInput v-model:value="config" type="textarea" :autosize="{ minRows: 4, maxRows: 16 }" class="font-mono" :input-props="{ 'aria-label': t('tools.prefix-list-tester.config'), 'spellcheck': false }" data-testid="config" />
    </NFormItem>
    <p class="mb-3 mt-0 text-xs nt-muted">
      {{ t('tools.prefix-list-tester.help', { n: parsed.entries.length }) }}
    </p>
    <NFormItem :label="t('tools.prefix-list-tester.routes')" :show-feedback="false" class="mb-0">
      <NInput v-model:value="routes" type="textarea" :autosize="{ minRows: 3, maxRows: 12 }" class="font-mono" :input-props="{ 'aria-label': t('tools.prefix-list-tester.routes') }" data-testid="routes" />
    </NFormItem>
  </CCard>
  <NAlert v-if="parsed.invalid.length" type="warning" class="mb-4">
    {{ t('tools.prefix-list-tester.unparsed', { lines: parsed.invalid.join(', ') }) }}
  </NAlert>
  <CCard :title="t('common.result')" data-testid="result">
    <ResultTable :columns="[{ key: 'route', title: k('route'), mono: true, width: 180 }, { key: 'list', title: k('list'), width: 140 }, { key: 'result', title: k('result'), width: 100 }, { key: 'entry', title: k('entry'), mono: true, width: 420 }]" :rows="rows" row-key="id" filename="prefix-list-test.json" />
  </CCard>
</template>
