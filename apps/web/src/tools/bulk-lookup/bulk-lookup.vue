<script setup lang="ts">
import type { Tool } from '../tool'
import type { OpId, Row } from './bulk-lookup.service'
import { NAlert, NButton, NProgress } from 'naive-ui'
import { computed, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { apiGet } from '@/api/client'
import ResultTable from '@/components/ResultTable.vue'
import { recordCurrent } from '@/composables/history'
import { useQueryScope } from '@/composables/queryScope'
import { buildQuery } from '@/composables/useApi'
import { useQueryParam } from '@/composables/useQueryParam'
import { useCapabilitiesStore } from '@/stores/capabilities.store'
import CCard from '@/ui/c-card.vue'
import CInputText from '@/ui/c-input-text.vue'
import CSelect from '@/ui/c-select.vue'
import { DNS_TYPES, MAX_TARGETS, OPS, parseTargets, runBulk } from './bulk-lookup.service'

const { t } = useI18n()
const caps = useCapabilitiesStore()
const scope = useQueryScope()
const text = useQueryParam({ name: 'targets', defaultValue: '' })
const opId = useQueryParam({ name: 'op', defaultValue: 'dns' })
const type = useQueryParam({ name: 'type', defaultValue: 'A' })
const ports = useQueryParam({ name: 'ports', defaultValue: '22,80,443' })

const op = computed(() => OPS.find(o => o.id === opId.value) ?? OPS[0]!)
const opOptions = computed(() => OPS.filter(o => !caps.reasonFor({ runMode: 'server', capability: o.capability } as Tool)).map(o => ({ label: t(`tools.bulk-lookup.ops.${o.id}`), value: o.id as OpId })))
const parsed = computed(() => parseTargets(text.value))
const rows = ref<Row[]>([])
const running = ref(false)
const waiting = ref(0)
const done = computed(() => rows.value.filter(Boolean).length)
let controller: AbortController | undefined
let countdown: ReturnType<typeof setInterval> | undefined

function get<T>(path: string, q: Record<string, string>, signal?: AbortSignal): Promise<T> {
  return apiGet<T>(`${path}${buildQuery(q)}`, { signal })
}

async function run() {
  const targets = parsed.value.targets
  if (!targets.length)
    return
  controller?.abort()
  controller = new AbortController()
  rows.value = []
  running.value = true
  recordCurrent(scope)
  await runBulk(targets, op.value, { type: type.value, ports: ports.value }, {
    get,
    signal: controller.signal,
    onRow: (i, r) => {
      const next = [...rows.value]
      next[i] = r
      rows.value = next
    },
    onWait: (s) => {
      waiting.value = s
      clearInterval(countdown)
      countdown = setInterval(() => (waiting.value = Math.max(0, waiting.value - 1)), 1000)
    },
  })
  clearInterval(countdown)
  waiting.value = 0
  running.value = false
}
function stop() {
  controller?.abort()
  running.value = false
}
onBeforeUnmount(stop)

const statusText = (s: Row['status']) => t(`tools.bulk-lookup.status.${s}`)
const tableRows = computed(() => rows.value.filter(Boolean).map(r => ({ ...r, status: statusText(r.status) })))
const k = (key: string) => t(`tools.bulk-lookup.columns.${key}`)
</script>

<template>
  <CCard>
    <form class="contents" @submit.prevent="run">
      <CInputText v-model:value="text" :label="t('tools.bulk-lookup.targets', { max: MAX_TARGETS })" :placeholder="t('tools.bulk-lookup.placeholder')" multiline :rows="6" monospace test-id="targets" />
      <div class="grid gap-x-3 sm:grid-cols-2">
        <CSelect v-model:value="opId" :label="t('tools.bulk-lookup.op')" :options="opOptions" test-id="op" />
        <CSelect v-if="op.id === 'dns'" v-model:value="type" :label="t('tools.bulk-lookup.type')" :options="DNS_TYPES.map(x => ({ label: x, value: x }))" test-id="type" />
        <CInputText v-if="op.id === 'port'" v-model:value="ports" :label="t('tools.bulk-lookup.ports')" placeholder="22,80,443" monospace test-id="ports" />
      </div>
      <p class="mt-0 text-xs nt-muted">
        {{ t('tools.bulk-lookup.count', { n: parsed.targets.length }) }}
        <span v-if="parsed.tooMany">{{ t('tools.bulk-lookup.tooMany', { max: MAX_TARGETS }) }}</span>
      </p>
      <div class="flex gap-2">
        <NButton type="primary" attr-type="submit" :disabled="!parsed.targets.length || running" data-testid="run">
          {{ t('tools.bulk-lookup.run') }}
        </NButton>
        <NButton v-if="running" @click="stop">
          {{ t('tools.bulk-lookup.stop') }}
        </NButton>
      </div>
    </form>
  </CCard>
  <CCard v-if="running || rows.length" :title="t('common.result')" data-testid="result">
    <NProgress v-if="running" type="line" :percentage="Math.round((done / Math.max(1, parsed.targets.length)) * 100)" :show-indicator="false" class="mb-2" />
    <NAlert v-if="running && waiting" type="info" class="mb-3" data-testid="waiting">
      {{ t('tools.bulk-lookup.waiting', { s: waiting }) }}
    </NAlert>
    <ResultTable :columns="[{ key: 'target', title: k('target'), mono: true, sortable: true, width: 200 }, { key: 'status', title: k('status'), sortable: true, width: 100 }, { key: 'result', title: k('result'), mono: true, width: 300 }, { key: 'detail', title: k('detail'), mono: true, width: 260 }]" :rows="tableRows" row-key="target" filename="bulk-lookup.json" />
  </CCard>
</template>
