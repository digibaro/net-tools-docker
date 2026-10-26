<script setup lang="ts">
import type { Sample } from './latency-monitor.service'
import { NButton, NFormItem, NInputNumber, NProgress } from 'naive-ui'
import { computed, onBeforeUnmount, ref, shallowRef, triggerRef } from 'vue'
import { useI18n } from 'vue-i18n'
import ApiError from '@/components/ApiError.vue'
import LatencyChart from '@/components/LatencyChart.vue'
import ResultTable from '@/components/ResultTable.vue'
import { useQueryParam } from '@/composables/useQueryParam'
import { useSse } from '@/composables/useSse'
import { useValidation } from '@/composables/useValidation'
import { useCapabilitiesStore } from '@/stores/capabilities.store'
import CCard from '@/ui/c-card.vue'
import CInputText from '@/ui/c-input-text.vue'
import CKeyValueList from '@/ui/c-key-value-list.vue'
import { isValidHost } from '@/utils/host'
import { buckets, overall } from './latency-monitor.service'

const { t } = useI18n()
const caps = useCapabilitiesStore()
const target = useQueryParam({ name: 'target', defaultValue: '' })
const minutes = useQueryParam({ name: 'minutes', defaultValue: 5 })
const interval = useQueryParam({ name: 'interval', defaultValue: 1 })
const maxMinutes = computed(() => caps.capabilities?.limits.monitorMaxMinutes ?? 30)
const validation = useValidation({ source: target, rules: [{ validator: (s: string) => !s || isValidHost(s), message: t('tools.ping.invalid') }] })
const samples = shallowRef<Sample[]>([])
const bySeq = new Map<number, Sample>()
const start = ref(0)
const now = ref(0)
let timer: ReturnType<typeof setInterval> | undefined
const { status, error, start: begin, stop } = useSse('/v1/ping/monitor/stream', {
  sent: (d) => {
    const e = d as { seq: number, at: number }
    const s = { seq: e.seq, at: e.at, rtt: null }
    if (!start.value)
      start.value = e.at
    bySeq.set(e.seq, s)
    samples.value.push(s)
    triggerRef(samples)
  },
  reply: (d) => {
    const e = d as { seq: number, rttMs: number }
    const s = bySeq.get(e.seq)
    if (s) {
      s.rtt = e.rttMs
      triggerRef(samples)
    }
  },
})
const running = computed(() => status.value === 'running')
function run() {
  if (!target.value || !validation.value.isValid)
    return
  samples.value = []
  bySeq.clear()
  start.value = 0
  clearInterval(timer)
  timer = setInterval(() => (now.value = Date.now()), 1000)
  begin({ target: target.value.trim(), minutes: Math.min(minutes.value, maxMinutes.value), interval: interval.value })
}
onBeforeUnmount(() => clearInterval(timer))
const stats = computed(() => overall(samples.value))
const perMinute = computed(() => buckets(samples.value, start.value).map(b => ({ ...b, minute: b.minute + 1, loss: `${b.lossPct} %` })))
const progress = computed(() => (start.value ? Math.min(100, (now.value - start.value) / (minutes.value * 60_000) * 100) : 0))
const k = (key: string) => t(`tools.latency-monitor.fields.${key}`)
const rows = computed(() => [
  { label: k('probes'), value: `${stats.value.received} / ${stats.value.sent} (${stats.value.lossPct} % ${k('loss')})`, noCopy: true },
  { label: k('latency'), value: `${stats.value.min} / ${stats.value.median} / ${stats.value.p95} / ${stats.value.max} ms`, noCopy: true },
  { label: k('jitter'), value: `${stats.value.jitter} ms`, noCopy: true },
])
const recent = computed(() => samples.value.slice(-300).map(s => s.rtt))
</script>

<template>
  <CCard>
    <form class="contents" @submit.prevent="run">
      <CInputText v-model:value="target" :label="t('ping.target')" placeholder="example.com" :validation="validation" monospace test-id="target" />
      <div class="flex flex-wrap gap-x-4">
        <NFormItem :label="t('tools.latency-monitor.minutes', { max: maxMinutes })" :show-feedback="false" class="mb-3 w-44">
          <NInputNumber v-model:value="minutes" :min="1" :max="maxMinutes" :show-button="false" :input-props="{ 'aria-label': t('tools.latency-monitor.minutes', { max: maxMinutes }) }" />
        </NFormItem>
        <NFormItem :label="t('tools.latency-monitor.interval')" :show-feedback="false" class="mb-3 w-44">
          <NInputNumber v-model:value="interval" :min="1" :max="10" :show-button="false" :input-props="{ 'aria-label': t('tools.latency-monitor.interval') }" />
        </NFormItem>
      </div>
      <div class="flex gap-2">
        <NButton type="primary" attr-type="submit" :loading="running" :disabled="running || !target || !validation.isValid" data-testid="run">
          {{ t('tools.latency-monitor.run') }}
        </NButton>
        <NButton v-if="running" @click="stop">
          {{ t('common.stop') }}
        </NButton>
      </div>
      <p class="mb-0 text-xs nt-muted">
        {{ t('tools.latency-monitor.note') }}
      </p>
    </form>
  </CCard>
  <ApiError v-if="error" :error="error" />
  <CCard v-if="samples.length" :title="t('common.result')" data-testid="result">
    <NProgress v-if="running" type="line" :percentage="progress" :show-indicator="false" :aria-label="t('tools.latency-monitor.progress')" class="mb-3" />
    <LatencyChart :samples="recent" :height="160" :label="t('tools.latency-monitor.chart')" />
    <CKeyValueList :rows="rows" class="mt-3" />
    <ResultTable v-if="perMinute.length" class="mt-3" :columns="[{ key: 'minute', title: k('minute'), width: 70 }, { key: 'sent', title: k('sent'), width: 70 }, { key: 'loss', title: k('loss'), width: 80 }, { key: 'min', title: 'min', width: 70 }, { key: 'avg', title: 'avg', width: 70 }, { key: 'p95', title: 'p95', width: 70 }, { key: 'max', title: 'max', width: 70 }]" :rows="perMinute" row-key="minute" filename="latency-monitor.json" />
  </CCard>
</template>
