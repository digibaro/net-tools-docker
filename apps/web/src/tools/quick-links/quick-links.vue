<script setup lang="ts">
import type { QuickLinks } from './quick-links.service'
import { ExternalLink } from '@vicons/tabler'
import { NA, NAlert, NCard, NIcon, NInput } from 'naive-ui'
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import ApiError from '@/components/ApiError.vue'
import { useApi } from '@/composables/useApi'
import { useQueryParam } from '@/composables/useQueryParam'
import CCard from '@/ui/c-card.vue'
import { groupLinks, hostOf, linkHref } from './quick-links.service'

const { t } = useI18n()
const q = useQueryParam({ name: 'q', defaultValue: '' })
const { data, error, run } = useApi<QuickLinks>('/v1/links')
onMounted(() => void run({}))
const groups = computed(() => groupLinks(data.value?.links ?? [], q.value, t('tools.quick-links.other')))
</script>

<template>
  <CCard>
    <NInput v-model:value="q" clearable :placeholder="t('tools.quick-links.filter')" :input-props="{ 'aria-label': t('tools.quick-links.filter') }" data-testid="filter" />
  </CCard>
  <ApiError v-if="error" :error="error" />
  <template v-if="data">
    <NAlert v-if="data.configError" type="warning" class="mb-4">
      {{ data.configError }}
    </NAlert>
    <NAlert v-else-if="!data.custom" type="info" class="mb-4" data-testid="examples">
      {{ t('tools.quick-links.examples') }}
    </NAlert>
    <section v-for="g in groups" :key="g.name" class="mb-4" data-testid="result">
      <h2 class="mb-2 mt-0 text-base font-semibold">
        {{ g.name }}
      </h2>
      <div class="grid gap-3 lg:grid-cols-3 sm:grid-cols-2">
        <NCard v-for="l in g.links" :key="l.url + l.name" size="small">
          <NA v-if="linkHref(l.url)" :href="linkHref(l.url)" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 font-semibold">
            {{ l.name }}
            <NIcon :component="ExternalLink" aria-hidden="true" />
          </NA>
          <span v-else class="font-semibold">{{ l.name }}</span>
          <div class="truncate text-xs nt-muted font-mono">
            {{ hostOf(l.url) }}
          </div>
          <p v-if="l.description" class="mb-0 mt-1 text-sm">
            {{ l.description }}
          </p>
        </NCard>
      </div>
    </section>
    <p v-if="!groups.length" class="nt-muted">
      {{ t('tools.quick-links.none') }}
    </p>
  </template>
</template>
