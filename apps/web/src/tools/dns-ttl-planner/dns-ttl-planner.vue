<script setup lang="ts">
import type { DnsLookup } from '../dns-lookup/dns-lookup.service'
import type { Step } from './dns-ttl-planner.service'
import { NButton, NDatePicker, NFormItem, NInputNumber } from 'naive-ui'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { apiGet } from '@/api/client'
import ResultTable from '@/components/ResultTable.vue'
import { buildQuery } from '@/composables/useApi'
import { useQueryParam } from '@/composables/useQueryParam'
import CCard from '@/ui/c-card.vue'
import CInputText from '@/ui/c-input-text.vue'
import { downloadText } from '@/utils/download'
import { plan, toIcs } from './dns-ttl-planner.service'

const { t, locale } = useI18n()
const name = useQueryParam({ name: 'name', defaultValue: 'www.example.com' })
const ttl = useQueryParam({ name: 'ttl', defaultValue: 86400 })
const low = useQueryParam({ name: 'low', defaultValue: 300 })
const change = useQueryParam({ name: 'at', defaultValue: Date.now() + 3 * 86400_000 })
const fetching = ref(false)
const fetched = ref('')
async function fetchTtl() {
  fetching.value = true
  try {
    const r = await apiGet<DnsLookup>(`/v1/dns/lookup${buildQuery({ name: name.value.trim(), type: 'A', resolver: 'cloudflare' })}`)
    const max = Math.max(0, ...r.answer.map(a => a.ttl))
    if (max) {
      ttl.value = max
      fetched.value = t('tools.dns-ttl-planner.fetched', { ttl: max })
    }
    else {
      fetched.value = t('tools.dns-ttl-planner.noRecord')
    }
  }
  catch {
    fetched.value = t('tools.dns-ttl-planner.noRecord')
  }
  finally {
    fetching.value = false
  }
}
const p = computed(() => plan(new Date(change.value), ttl.value, low.value))
const fmt = (d: Date) => d.toLocaleString(locale.value === 'nl' ? 'nl-NL' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })
const titles = computed(() => Object.fromEntries((['lower', 'lowered', 'change', 'propagated', 'restore'] as Step['id'][]).map(id => [id, t(`tools.dns-ttl-planner.steps.${id}`, { low: low.value, ttl: ttl.value })])) as Record<Step['id'], string>)
const rows = computed(() => p.value.steps.map(s => ({ id: s.id, when: fmt(s.at), what: titles.value[s.id] })))
const download = () => downloadText('dns-ttl-plan.ics', toIcs(p.value.steps, titles.value, name.value), 'text/calendar')
</script>

<template>
  <CCard>
    <div class="grid items-end gap-x-4 sm:grid-cols-[1fr_auto]">
      <CInputText v-model:value="name" :label="t('tools.dns-ttl-planner.name')" monospace test-id="name" />
      <NButton class="mb-3" :loading="fetching" @click="fetchTtl">
        {{ t('tools.dns-ttl-planner.fetch') }}
      </NButton>
    </div>
    <p v-if="fetched" class="mb-3 mt-0 text-xs nt-muted">
      {{ fetched }}
    </p>
    <div class="grid gap-x-4 sm:grid-cols-3">
      <NFormItem :label="t('tools.dns-ttl-planner.ttl')" :show-feedback="false" class="mb-3">
        <NInputNumber v-model:value="ttl" :min="1" :show-button="false" :input-props="{ 'aria-label': t('tools.dns-ttl-planner.ttl') }" />
      </NFormItem>
      <NFormItem :label="t('tools.dns-ttl-planner.low')" :show-feedback="false" class="mb-3">
        <NInputNumber v-model:value="low" :min="1" :show-button="false" :input-props="{ 'aria-label': t('tools.dns-ttl-planner.low') }" />
      </NFormItem>
      <NFormItem :label="t('tools.dns-ttl-planner.change')" :show-feedback="false" class="mb-3">
        <NDatePicker v-model:value="change" type="datetime" :input-props="{ 'aria-label': t('tools.dns-ttl-planner.change') }" />
      </NFormItem>
    </div>
  </CCard>
  <CCard :title="t('tools.dns-ttl-planner.plan')" data-testid="result">
    <ResultTable :columns="[{ key: 'when', title: t('tools.dns-ttl-planner.when'), width: 200 }, { key: 'what', title: t('tools.dns-ttl-planner.what'), width: 440 }]" :rows="rows" row-key="id" filename="dns-ttl-plan.json" />
    <p class="text-sm">
      {{ t('tools.dns-ttl-planner.worst', { min: p.worstCaseMinutes }) }}
    </p>
    <NButton size="small" data-testid="ics" @click="download">
      {{ t('tools.dns-ttl-planner.ics') }}
    </NButton>
  </CCard>
</template>
