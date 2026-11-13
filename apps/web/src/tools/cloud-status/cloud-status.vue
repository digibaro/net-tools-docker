<script setup lang="ts">
import type { CloudStatus } from './cloud-status.service'
import { ExternalLink } from '@vicons/tabler'
import { useIntervalFn } from '@vueuse/core'
import { NA, NAlert, NButton, NCard, NIcon, NInput, NSwitch, NTag } from 'naive-ui'
import { computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ApiError from '@/components/ApiError.vue'
import { useApi } from '@/composables/useApi'
import { useQueryParam } from '@/composables/useQueryParam'
import CCard from '@/ui/c-card.vue'
import { filterServices, safeUrl, shortList, sortServices, stateTag, summarize } from './cloud-status.service'

const { t, locale } = useI18n()
const q = useQueryParam({ name: 'q', defaultValue: '' })
const problemsOnly = useQueryParam({ name: 'problems', defaultValue: false })
const auto = useQueryParam({ name: 'auto', defaultValue: false })
const { data, error, loading, run } = useApi<CloudStatus>('/v1/status/cloud')
const refresh = () => run({})
onMounted(refresh)
// The server caches each feed for 2 minutes; refreshing more often would only repeat the cache.
const timer = useIntervalFn(refresh, 120_000, { immediate: false })
watch(auto, on => (on ? timer.resume() : timer.pause()), { immediate: true })

function fmt(s: string) {
  if (!s)
    return ''
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString(locale.value === 'nl' ? 'nl-NL' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' })
}
const services = computed(() => filterServices(sortServices(data.value?.services ?? []), q.value, problemsOnly.value))
const summary = computed(() => summarize(data.value?.services ?? []))
</script>

<template>
  <CCard>
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
      <NButton :loading="loading" data-testid="run" @click="refresh">
        {{ t('tools.cloud-status.refresh') }}
      </NButton>
      <label class="flex items-center gap-2 text-sm">
        <NSwitch v-model:value="auto" :aria-label="t('tools.cloud-status.auto')" />
        {{ t('tools.cloud-status.auto') }}
      </label>
      <label class="flex items-center gap-2 text-sm">
        <NSwitch v-model:value="problemsOnly" :aria-label="t('tools.cloud-status.problemsOnly')" />
        {{ t('tools.cloud-status.problemsOnly') }}
      </label>
      <NInput v-model:value="q" clearable size="small" class="max-w-60" :placeholder="t('tools.cloud-status.filter')" :input-props="{ 'aria-label': t('tools.cloud-status.filter') }" />
    </div>
    <p class="mb-0 mt-3 text-xs nt-muted">
      {{ t('tools.cloud-status.note') }}
    </p>
  </CCard>
  <ApiError v-if="error" :error="error" />
  <template v-if="data">
    <NAlert v-if="data.configError" type="warning" class="mb-4">
      {{ data.configError }}
    </NAlert>
    <p class="mb-3 mt-0 text-sm" data-testid="summary">
      <span v-if="summary.problems">{{ t('tools.cloud-status.summaryProblems', { n: summary.problems, total: summary.total }) }}</span>
      <span v-else>{{ t('tools.cloud-status.summaryOk', { total: summary.total }) }}</span>
      <span v-if="summary.unknown"> · {{ t('tools.cloud-status.summaryUnknown', { n: summary.unknown }) }}</span>
      <span class="nt-muted"> · {{ t('tools.cloud-status.checkedAt', { time: fmt(data.checkedAt) }) }}</span>
    </p>
    <div class="grid gap-3 sm:grid-cols-2" data-testid="result">
      <NCard v-for="s in services" :key="s.id" size="small" :data-testid="`service-${s.id}`">
        <div class="flex items-start justify-between gap-2">
          <h2 class="m-0 text-base font-semibold">
            {{ s.name }}
          </h2>
          <NTag v-if="s.state !== 'link'" :type="stateTag(s.state)" size="small" :bordered="false" :data-testid="`state-${s.id}`">
            {{ t(`tools.cloud-status.states.${s.state}`) }}
          </NTag>
        </div>
        <p v-if="s.error" class="mb-0 mt-2 text-sm nt-muted">
          {{ s.error }}
        </p>
        <p v-if="s.state === 'link'" class="mb-0 mt-2 text-sm nt-muted">
          {{ t('tools.cloud-status.linkOnly') }}
        </p>
        <ul v-if="s.incidents.length" class="m-0 mt-2 list-none p-0 text-sm">
          <li v-for="(i, n) in s.incidents" :key="n" class="mb-2">
            <NTag size="tiny" :type="i.impact === 'info' ? 'default' : stateTag(i.impact)" :bordered="false" class="mr-1">
              {{ t(`tools.cloud-status.impact.${i.impact}`) }}
            </NTag>
            <NA v-if="safeUrl(i.url)" :href="safeUrl(i.url)" target="_blank" rel="noopener noreferrer">
              {{ i.title }}
            </NA>
            <span v-else>{{ i.title }}</span>
            <div v-if="i.status || i.updated" class="text-xs nt-muted">
              {{ [i.status, i.updated ? t('tools.cloud-status.updated', { time: fmt(i.updated) }) : ''].filter(Boolean).join(' · ') }}
            </div>
          </li>
        </ul>
        <p v-if="s.components.length" class="mb-0 mt-2 text-xs nt-muted">
          {{ t('tools.cloud-status.components', { list: shortList(s.components).shown }) }}<span v-if="shortList(s.components).more"> {{ t('tools.cloud-status.more', { n: shortList(s.components).more }) }}</span>
        </p>
        <div class="mt-2">
          <NA v-if="safeUrl(s.page)" :href="safeUrl(s.page)" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-sm">
            {{ t('tools.cloud-status.open') }}
            <NIcon :component="ExternalLink" aria-hidden="true" />
          </NA>
        </div>
      </NCard>
    </div>
    <p v-if="!services.length" class="nt-muted">
      {{ t('tools.cloud-status.none') }}
    </p>
  </template>
</template>
