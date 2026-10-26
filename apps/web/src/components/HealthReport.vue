<script setup lang="ts">
import type { Check } from './health-report'
import { NTag } from 'naive-ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { grade, sortChecks } from './health-report'
import ResultActions from './ResultActions.vue'
import ResultTable from './ResultTable.vue'

/** Graded list of checks; labels come from `<prefix>.checks.<id>`, statuses from `report.status.*`. */
const props = defineProps<{ checks: Check[], prefix: string, title: string, filename: string }>()
const { t } = useI18n()
const g = computed(() => grade(props.checks))
const tagType = { A: 'success', B: 'success', C: 'warning', D: 'error', F: 'error' } as const
const rows = computed(() => sortChecks(props.checks).map(c => ({ id: c.id, status: t(`report.status.${c.status}`), check: t(`${props.prefix}.checks.${c.id}`, c.params ?? {}), detail: c.detail || '—' })))
const asText = () => [`${props.title}: ${g.value.letter} (${g.value.score}/100)`, ...rows.value.map(r => `[${r.status}] ${r.check}: ${r.detail}`)].join('\n')
</script>

<template>
  <div data-testid="report">
    <div class="mb-3 flex flex-wrap items-center gap-3">
      <NTag :type="tagType[g.letter]" size="large" :bordered="false" data-testid="grade">
        {{ g.letter }}
      </NTag>
      <span class="text-sm">{{ t('report.score', { score: g.score, fail: checks.filter(c => c.status === 'fail').length, warn: checks.filter(c => c.status === 'warn').length }) }}</span>
    </div>
    <ResultTable :columns="[{ key: 'status', title: t('report.columns.status'), width: 100 }, { key: 'check', title: t('report.columns.check'), width: 320 }, { key: 'detail', title: t('report.columns.detail'), mono: true, width: 380 }]" :rows="rows" row-key="id" :filename="filename" :actions="false" :label="title" />
    <div class="mt-3">
      <ResultActions :text="asText" :json="checks" :filename="filename" />
    </div>
  </div>
</template>
