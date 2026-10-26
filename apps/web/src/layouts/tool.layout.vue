<script setup lang="ts">
import type { Tool } from '@/tools/tool'
import { LayoutColumns, Pin, PinnedOff, Printer, Trash } from '@vicons/tabler'
import { NButton, NIcon, NTag, NTooltip } from 'naive-ui'
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { lowBudget, rateBudget } from '@/api/ratelimit'
import FavoriteButton from '@/components/FavoriteButton.vue'
import RunModeBadge from '@/components/RunModeBadge.vue'
import ToolDisabled from '@/components/ToolDisabled.vue'
import { addHistory, clearHistory, getHistory, historyVersion, label, togglePin } from '@/composables/history'
import { compareQuery } from '@/composables/queryScope'
import { useCapabilitiesStore } from '@/stores/capabilities.store'

const props = defineProps<{ tool: Tool }>()
const caps = useCapabilitiesStore()
const reason = computed(() => caps.reasonFor(props.tool))
const { t } = useI18n()
// The browser's print dialog also saves as PDF; the print stylesheet in App.vue hides the chrome.
const print = () => window.print()
const route = useRoute()
const router = useRouter()
// Browser tools have no "run": remember their inputs once the URL has been stable for 5 s.
let settle: ReturnType<typeof setTimeout> | undefined
watch(() => route.fullPath, () => {
  clearTimeout(settle)
  if (props.tool.runMode === 'browser')
    settle = setTimeout(addHistory, 5000, route.path, window.location.search)
})
const recent = computed(() => {
  void historyVersion.value
  return getHistory(props.tool.path).filter(e => `?${e.search}` !== window.location.search)
})
const open = (search: string) => router.push(`${props.tool.path}?${search}`)
const compare = () => router.push({ path: '/compare', query: compareQuery(props.tool.path, route.query) })
const heavyLeft = computed(() => (props.tool.runMode === 'browser' ? undefined : lowBudget(rateBudget.heavy)))
</script>

<template>
  <div class="mx-auto max-w-4xl">
    <header class="mb-5">
      <div class="flex flex-wrap items-center gap-2">
        <NIcon :component="tool.icon" :size="28" aria-hidden="true" />
        <h1 class="m-0 text-2xl font-semibold">
          {{ tool.name }}
        </h1>
        <RunModeBadge :mode="tool.runMode" />
        <FavoriteButton :tool="tool" />
        <NTooltip>
          <template #trigger>
            <NButton quaternary circle size="small" class="nt-no-print" :aria-label="t('common.print')" data-testid="print" @click="print()">
              <template #icon>
                <NIcon aria-hidden="true" :component="Printer" />
              </template>
            </NButton>
          </template>
          {{ t('common.print') }}
        </NTooltip>
        <NTooltip>
          <template #trigger>
            <NButton quaternary circle size="small" class="nt-no-print" :aria-label="t('compare.open')" data-testid="compare" @click="compare()">
              <template #icon>
                <NIcon aria-hidden="true" :component="LayoutColumns" />
              </template>
            </NButton>
          </template>
          {{ t('compare.open') }}
        </NTooltip>
      </div>
      <p class="mb-0 mt-2 nt-muted">
        {{ tool.description }}
      </p>
    </header>
    <p v-if="heavyLeft !== undefined" class="nt-no-print mb-3 mt-0 text-xs nt-muted" data-testid="rate-hint">
      {{ t('apiErrors.budget', { n: heavyLeft, limit: rateBudget.heavy?.limit }) }}
    </p>
    <div v-if="recent.length" class="nt-no-print mb-4 flex flex-wrap items-center gap-1" data-testid="history">
      <span class="mr-1 text-xs nt-muted">{{ t('history.recent') }}</span>
      <NTag v-for="e in recent" :key="e.search" size="small" :type="e.pinned ? 'primary' : 'default'" :bordered="false" class="cursor-pointer" @click="open(e.search)">
        <span class="font-mono">{{ label(e.search) }}</span>
        <template #icon>
          <NIcon :component="e.pinned ? PinnedOff : Pin" :aria-label="e.pinned ? t('history.unpin') : t('history.pin')" role="button" tabindex="0" @click.stop="togglePin(tool.path, e.search)" @keydown.enter.stop="togglePin(tool.path, e.search)" />
        </template>
      </NTag>
      <NButton quaternary size="tiny" :aria-label="t('history.clear')" @click="clearHistory(tool.path)">
        <template #icon>
          <NIcon aria-hidden="true" :component="Trash" />
        </template>
      </NButton>
    </div>
    <ToolDisabled v-if="reason" :reason="reason" />
    <slot />
  </div>
</template>
