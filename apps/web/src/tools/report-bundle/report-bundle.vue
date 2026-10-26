<script setup lang="ts">
import { ArrowDown, ArrowUp, Markdown, Printer, Trash } from '@vicons/tabler'
import { NButton, NIcon, NPopconfirm } from 'naive-ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ResultTable from '@/components/ResultTable.vue'
import { clearReport, getReport, moveInReport, removeFromReport, reportVersion, toMarkdown } from '@/composables/report'
import { useToolStore } from '@/stores/tool.store'
import CCard from '@/ui/c-card.vue'
import { downloadText } from '@/utils/download'
import { linkFor, titleFor } from './report-bundle.service'

const { t, locale } = useI18n()
const store = useToolStore()
const items = computed(() => {
  void reportVersion.value
  return getReport()
})
const title = (i: Parameters<typeof titleFor>[0]) => titleFor(i, store.tools)
const when = (at: number) => new Date(at).toLocaleString(locale.value === 'nl' ? 'nl-NL' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' })
const markdown = () => downloadText('nettools-report.md', toMarkdown(items.value, title, window.location.origin, t('tools.report-bundle.heading')), 'text/markdown;charset=utf-8')
const print = () => window.print()
const json = () => downloadText('nettools-report.json', JSON.stringify(items.value.map(i => ({ tool: title(i), url: `${window.location.origin}${linkFor(i)}`, at: new Date(i.at).toISOString(), label: i.label, columns: i.columns, rows: i.rows })), null, 2), 'application/json')
</script>

<template>
  <CCard>
    <p class="mt-0 text-sm">
      {{ t('tools.report-bundle.intro') }}
    </p>
    <div class="nt-no-print flex flex-wrap gap-2">
      <NButton :disabled="!items.length" data-testid="download-md" @click="markdown">
        <template #icon>
          <NIcon aria-hidden="true" :component="Markdown" />
        </template>
        {{ t('tools.report-bundle.markdown') }}
      </NButton>
      <NButton :disabled="!items.length" @click="json">
        {{ t('tools.report-bundle.json') }}
      </NButton>
      <NButton :disabled="!items.length" @click="print">
        <template #icon>
          <NIcon aria-hidden="true" :component="Printer" />
        </template>
        {{ t('tools.report-bundle.print') }}
      </NButton>
      <NPopconfirm @positive-click="clearReport">
        <template #trigger>
          <NButton :disabled="!items.length" type="error" secondary>
            {{ t('tools.report-bundle.clear') }}
          </NButton>
        </template>
        {{ t('tools.report-bundle.confirmClear') }}
      </NPopconfirm>
    </div>
  </CCard>
  <p v-if="!items.length" class="my-8 text-center nt-muted" data-testid="empty">
    {{ t('tools.report-bundle.empty') }}
  </p>
  <CCard v-for="(i, n) in items" :key="i.id" :title="`${n + 1}. ${title(i)}${i.label ? ` — ${i.label}` : ''}`" data-testid="report-item">
    <div class="mb-2 flex flex-wrap items-center gap-2 text-xs">
      <RouterLink :to="linkFor(i)" class="font-mono">
        {{ linkFor(i) }}
      </RouterLink>
      <span class="nt-muted">{{ when(i.at) }}</span>
      <span v-if="i.truncated" class="nt-muted">{{ t('tools.report-bundle.truncated') }}</span>
      <span class="flex-1" />
      <span class="nt-no-print flex gap-1">
        <NButton quaternary size="tiny" :disabled="n === 0" :aria-label="t('tools.report-bundle.up')" @click="moveInReport(i.id, -1)">
          <template #icon>
            <NIcon aria-hidden="true" :component="ArrowUp" />
          </template>
        </NButton>
        <NButton quaternary size="tiny" :disabled="n === items.length - 1" :aria-label="t('tools.report-bundle.down')" @click="moveInReport(i.id, 1)">
          <template #icon>
            <NIcon aria-hidden="true" :component="ArrowDown" />
          </template>
        </NButton>
        <NButton quaternary size="tiny" :aria-label="t('tools.report-bundle.remove')" data-testid="remove" @click="removeFromReport(i.id)">
          <template #icon>
            <NIcon aria-hidden="true" :component="Trash" />
          </template>
        </NButton>
      </span>
    </div>
    <ResultTable :columns="i.columns" :rows="i.rows" :reportable="false" :label="title(i)" :filename="`${i.path.slice(1)}.json`" />
  </CCard>
</template>
