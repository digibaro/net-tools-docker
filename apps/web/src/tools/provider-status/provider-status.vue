<script setup lang="ts">
import type { ProviderStatus } from './provider-status.service'
import { NButton } from 'naive-ui'
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import ApiError from '@/components/ApiError.vue'
import ResultTable from '@/components/ResultTable.vue'
import { useApi } from '@/composables/useApi'
import CCard from '@/ui/c-card.vue'
import { cacheRate, state } from './provider-status.service'

const { t, locale } = useI18n()
const { data, error, loading, run } = useApi<ProviderStatus>('/v1/providers/status')
onMounted(() => void run({}))
const fmt = (s: string | null) => (s ? new Date(s).toLocaleString(locale.value === 'nl' ? 'nl-NL' : 'en-GB', { dateStyle: 'short', timeStyle: 'medium' }) : '—')
const k = (key: string) => t(`tools.provider-status.columns.${key}`)
const rows = computed(() => (data.value?.providers ?? []).map(p => ({
  id: p.name,
  name: p.name,
  state: t(`tools.provider-status.states.${state(p)}`),
  key: p.secret ? `${p.secret}: ${p.keyConfigured ? t('tools.provider-status.set') : p.keyOptional ? t('tools.provider-status.optional') : t('tools.provider-status.missing')}` : t('tools.provider-status.keyless'),
  requests: p.requests,
  cache: p.requests ? `${cacheRate(p)} %` : '—',
  errors: p.errors,
  lastOk: fmt(p.lastOk),
  problem: p.lastProblem ? `${p.lastProblem} (${fmt(p.lastError)})` : '—',
})))
</script>

<template>
  <CCard>
    <p class="mt-0 text-sm">
      {{ t('tools.provider-status.intro') }}
    </p>
    <NButton :loading="loading" data-testid="run" @click="run({})">
      {{ t('tools.provider-status.refresh') }}
    </NButton>
  </CCard>
  <ApiError v-if="error" :error="error" />
  <CCard v-if="data" :title="t('tools.provider-status.since', { time: fmt(data.since) })" data-testid="result">
    <ResultTable :columns="[{ key: 'name', title: k('name'), width: 170 }, { key: 'state', title: k('state'), width: 130 }, { key: 'key', title: k('key'), mono: true, width: 220 }, { key: 'requests', title: k('requests'), width: 90 }, { key: 'cache', title: k('cache'), width: 80 }, { key: 'errors', title: k('errors'), width: 70 }, { key: 'lastOk', title: k('lastOk'), width: 160 }, { key: 'problem', title: k('problem'), width: 260 }]" :rows="rows" row-key="id" filename="provider-status.json" />
  </CCard>
</template>
