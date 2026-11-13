<script setup lang="ts">
import type { DropdownOption } from 'naive-ui'
import type { Tool } from '@/tools/tool'
import { ExternalLink, ZoomQuestion } from '@vicons/tabler'
import { NButton, NDropdown, NIcon } from 'naive-ui'
import { computed, h } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useStyleStore } from '@/stores/style.store'
import { useToolStore } from '@/stores/tool.store'
import { externalLinks, quickActions, targetFromQuery } from '@/tools/targets'

/** "Look up elsewhere": the target in the URL, opened in other tools or third-party sites. */
const props = defineProps<{ tool: Tool }>()
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const style = useStyleStore()
const tools = useToolStore()

const target = computed(() => targetFromQuery(props.tool, route.query))
const actions = computed(() => (target.value ? quickActions(target.value, tools.tools).filter(a => a.tool.path !== props.tool.path) : []))
const links = computed(() => (target.value && style.externalLinks ? externalLinks(target.value) : []))
const icon = (c: typeof ExternalLink) => () => h(NIcon, { component: c })

const options = computed<DropdownOption[]>(() => [
  ...(actions.value.length
    ? [{ type: 'group', key: 'tools', label: t('pivot.tools'), children: actions.value.map(a => ({ key: `run:${a.to}`, label: a.tool.name, icon: icon(a.tool.icon as typeof ExternalLink) })) }]
    : []),
  ...(links.value.length
    ? [{ type: 'group', key: 'ext', label: t('pivot.external'), children: links.value.map(l => ({ key: `ext:${l.url}`, label: l.name, icon: icon(ExternalLink) })) }]
    : []),
])

function select(key: string) {
  if (key.startsWith('run:'))
    void router.push(key.slice(4))
  else if (key.startsWith('ext:'))
    window.open(key.slice(4), '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <NDropdown v-if="options.length" trigger="click" :options="options" scrollable style="max-height: 70vh" @select="select">
    <NButton quaternary size="small" class="nt-no-print" data-testid="pivot">
      <template #icon>
        <NIcon aria-hidden="true" :component="ZoomQuestion" />
      </template>
      {{ t('pivot.button') }}
    </NButton>
  </NDropdown>
</template>
