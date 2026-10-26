<script setup lang="ts">
import type { TlsReport } from './tls-rpt-viewer.service'
import { Upload } from '@vicons/tabler'
import { NAlert, NButton, NIcon } from 'naive-ui'
import { computed, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import ResultTable from '@/components/ResultTable.vue'
import CCard from '@/ui/c-card.vue'
import CKeyValueList from '@/ui/c-key-value-list.vue'
import { fixed } from '@/utils/format'
import { MAX_FILE_BYTES, parseReport, summarize } from './tls-rpt-viewer.service'

const { t } = useI18n()
const fileInput = ref<HTMLInputElement>()
const reports = shallowRef<TlsReport[]>([])
const errors = ref<string[]>([])
async function onFiles(e: Event) {
  const files = [...((e.target as HTMLInputElement).files ?? [])]
  const ok: TlsReport[] = []
  const bad: string[] = []
  for (const f of files) {
    try {
      if (f.size > MAX_FILE_BYTES)
        throw new Error('too big')
      ok.push(parseReport(new Uint8Array(await f.arrayBuffer()), f.name))
    }
    catch {
      bad.push(f.name)
    }
  }
  reports.value = [...reports.value, ...ok]
  errors.value = bad
}
const s = computed(() => summarize(reports.value))
const k = (key: string) => t(`tools.tls-rpt-viewer.columns.${key}`)
const reportRows = computed(() => reports.value.flatMap(r => r.policies.map((p, i) => ({ id: `${r.file}${i}`, org: r.organization, period: `${r.start.slice(0, 10)} – ${r.end.slice(0, 10)}`, policy: `${p.type} ${p.domain}`, success: p.success, failure: p.failure }))))
</script>

<template>
  <CCard>
    <input ref="fileInput" type="file" multiple accept=".json,.gz,application/json,application/gzip,application/tlsrpt+json,application/tlsrpt+gzip" class="hidden" :aria-label="t('tools.tls-rpt-viewer.upload')" data-testid="file" @change="onFiles">
    <NButton @click="fileInput?.click()">
      <template #icon>
        <NIcon aria-hidden="true" :component="Upload" />
      </template>
      {{ t('tools.tls-rpt-viewer.upload') }}
    </NButton>
    <p class="mb-0 text-xs nt-muted">
      {{ t('tools.tls-rpt-viewer.note') }}
    </p>
  </CCard>
  <NAlert v-if="errors.length" type="error" class="mb-4">
    {{ t('tools.tls-rpt-viewer.unreadable', { files: errors.join(', ') }) }}
  </NAlert>
  <template v-if="reports.length">
    <CCard :title="t('tools.tls-rpt-viewer.summary', { n: reports.length })" data-testid="result">
      <NAlert :type="s.failure ? 'warning' : 'success'" class="mb-3">
        {{ t(s.failure ? 'tools.tls-rpt-viewer.someFail' : 'tools.tls-rpt-viewer.allOk', { rate: fixed(s.rate, 2), failure: s.failure }) }}
      </NAlert>
      <CKeyValueList :rows="[{ label: k('success'), value: String(s.success), noCopy: true }, { label: k('failure'), value: String(s.failure), noCopy: true }]" />
    </CCard>
    <CCard v-if="s.failures.length" :title="t('tools.tls-rpt-viewer.failures')">
      <ResultTable :columns="[{ key: 'resultType', title: k('type'), mono: true, width: 220 }, { key: 'receivingMx', title: 'MX', mono: true, width: 220 }, { key: 'count', title: k('sessions'), width: 100 }, { key: 'reporters', title: k('reporters'), width: 220 }]" :rows="s.failures.map(f => ({ ...f, id: `${f.resultType}${f.receivingMx}` }))" row-key="id" filename="tls-rpt-failures.json" />
      <p class="mb-0 text-xs nt-muted">
        {{ t('tools.tls-rpt-viewer.types') }}
      </p>
    </CCard>
    <CCard :title="t('tools.tls-rpt-viewer.reports')">
      <ResultTable :columns="[{ key: 'org', title: k('org'), width: 200 }, { key: 'period', title: k('period'), width: 200 }, { key: 'policy', title: k('policy'), mono: true, width: 220 }, { key: 'success', title: k('success'), width: 110 }, { key: 'failure', title: k('failure'), width: 100 }]" :rows="reportRows" row-key="id" filename="tls-rpt-reports.json" />
    </CCard>
  </template>
</template>
