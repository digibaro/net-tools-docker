<script setup lang="ts">
import type { ProbeResult } from './ipv6-test.service'
import { NAlert, NButton, NProgress } from 'naive-ui'
import { computed, onMounted, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import ResultTable from '@/components/ResultTable.vue'
import CCard from '@/ui/c-card.vue'
import { assess, PROBES, runProbe } from './ipv6-test.service'

const { t } = useI18n()
const results = shallowRef<ProbeResult[]>([])
const running = ref(false)

async function run() {
  running.value = true
  results.value = []
  // In parallel: each probe opens its own connection, so they do not slow each other down much.
  results.value = await Promise.all(PROBES.map(p => runProbe(p)))
  running.value = false
}
onMounted(run)

const a = computed(() => (results.value.length ? assess(results.value) : undefined))
const alertType = computed(() => ({ 'ipv6-ok': 'success', 'ipv4-only': 'info', 'ipv6-only': 'success', 'broken': 'error', 'offline': 'error' } as const)[a.value?.verdict ?? 'offline'])
const rows = computed(() => results.value.map(r => ({
  id: r.id,
  test: t(`tools.ipv6-test.probes.${r.id}`),
  result: r.ok ? t('tools.ipv6-test.ok', { family: `IPv${r.family}` }) : t(`tools.ipv6-test.errors.${r.error}`),
  ip: r.ip ?? '—',
  ipLink: r.ip ? `/ip-to-asn?ip=${encodeURIComponent(r.ip)}` : '',
  ms: `${r.ms} ms`,
})))
</script>

<template>
  <CCard>
    <p class="mt-0 text-sm">
      {{ t('tools.ipv6-test.intro') }}
    </p>
    <NButton type="primary" :loading="running" data-testid="run" @click="run">
      {{ t('tools.ipv6-test.run') }}
    </NButton>
  </CCard>
  <template v-if="a">
    <CCard :title="t('tools.ipv6-test.result')" data-testid="result">
      <div class="mb-3 flex flex-wrap items-center gap-4">
        <span class="text-3xl font-semibold" data-testid="score">{{ a.score }}/10</span>
        <NProgress type="line" class="max-w-60" :percentage="a.score * 10" :show-indicator="false" :status="a.score >= 8 ? 'success' : a.score >= 4 ? 'warning' : 'error'" :aria-label="t('tools.ipv6-test.scoreLabel', { score: a.score })" />
      </div>
      <NAlert :type="alertType" :show-icon="true" data-testid="verdict">
        {{ t(`tools.ipv6-test.verdicts.${a.verdict}`) }}
      </NAlert>
      <NAlert v-if="a.slowFallback" type="warning" class="mt-3">
        {{ t('tools.ipv6-test.slowFallback') }}
      </NAlert>
      <p v-if="a.verdict === 'ipv6-ok' || a.verdict === 'ipv6-only'" class="mb-0 mt-3 text-sm">
        {{ a.prefersV6 ? t('tools.ipv6-test.prefersV6') : t('tools.ipv6-test.prefersV4') }}
      </p>
    </CCard>
    <CCard :title="t('tools.ipv6-test.details')">
      <ResultTable
        :columns="[
          { key: 'test', title: t('tools.ipv6-test.columns.test'), width: 260 },
          { key: 'result', title: t('tools.ipv6-test.columns.result'), width: 170 },
          { key: 'ip', title: t('tools.ipv6-test.columns.ip'), mono: true, routeKey: 'ipLink', width: 260 },
          { key: 'ms', title: t('tools.ipv6-test.columns.ms'), width: 90 },
        ]"
        :rows="rows"
        row-key="id"
        filename="ipv6-test.json"
        :label="t('tools.ipv6-test.details')"
      />
      <p class="mb-0 mt-3 text-xs nt-muted">
        {{ t('tools.ipv6-test.note') }}
      </p>
    </CCard>
  </template>
</template>
