<script setup lang="ts">
import { ArrowsLeftRight } from '@vicons/tabler'
import { NButton, NIcon } from 'naive-ui'
import { computed, defineAsyncComponent } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import QueryScope from '@/components/QueryScope.vue'
import ToolDisabled from '@/components/ToolDisabled.vue'
import { useCapabilitiesStore } from '@/stores/capabilities.store'
import { useToolStore } from '@/stores/tool.store'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const store = useToolStore()
const caps = useCapabilitiesStore()
const tool = computed(() => store.tools.find(x => x.path === route.query.tool))
const reason = computed(() => (tool.value ? caps.reasonFor(tool.value) : undefined))
const Comp = computed(() => (tool.value ? defineAsyncComponent(tool.value.component as () => Promise<{ default: object }>) : undefined))

/** Copies or swaps the a./b. parameters. */
function shift(mode: 'copy' | 'swap') {
  const q: Record<string, string> = { tool: String(route.query.tool) }
  for (const [k, v] of Object.entries(route.query)) {
    if (typeof v !== 'string' || k === 'tool')
      continue
    const side = k.slice(0, 2)
    const name = k.slice(2)
    if (side === 'a.') {
      q[mode === 'swap' ? `b.${name}` : `a.${name}`] = v
      if (mode === 'copy')
        q[`b.${name}`] = v
    }
    else if (side === 'b.' && mode === 'swap') {
      q[`a.${name}`] = v
    }
  }
  void router.replace({ query: q })
}
</script>

<template>
  <div>
    <p v-if="!tool" class="my-12 text-center nt-muted">
      {{ t('compare.noTool') }}
    </p>
    <template v-else>
      <header class="mb-4 flex flex-wrap items-center gap-2">
        <NIcon :component="tool.icon" :size="26" aria-hidden="true" />
        <h1 class="m-0 text-xl font-semibold">
          {{ t('compare.title', { tool: tool.name }) }}
        </h1>
        <span class="flex-1" />
        <NButton size="small" secondary data-testid="compare-swap" @click="shift('swap')">
          <template #icon>
            <NIcon aria-hidden="true" :component="ArrowsLeftRight" />
          </template>
          {{ t('compare.swap') }}
        </NButton>
        <NButton size="small" secondary @click="shift('copy')">
          {{ t('compare.copy') }}
        </NButton>
        <RouterLink :to="tool.path" class="text-sm">
          {{ t('compare.single') }}
        </RouterLink>
      </header>
      <ToolDisabled v-if="reason" :reason="reason" />
      <div v-else class="grid gap-4 lg:grid-cols-2">
        <section v-for="side in ['a', 'b']" :key="side" :aria-label="t(`compare.side.${side}`)" class="min-w-0" :data-testid="`compare-${side}`">
          <h2 class="mb-2 mt-0 text-sm nt-muted font-semibold">
            {{ t(`compare.side.${side}`) }}
          </h2>
          <QueryScope :prefix="`${side}.`" :path="tool.path">
            <component :is="Comp" />
          </QueryScope>
        </section>
      </div>
    </template>
  </div>
</template>
