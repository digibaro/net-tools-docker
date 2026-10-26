<script setup lang="ts">
import type { Format } from './config-diff.service'
import { NAlert, NFormItem, NInput, useThemeVars } from 'naive-ui'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ResultActions from '@/components/ResultActions.vue'
import { useQueryParam } from '@/composables/useQueryParam'
import CCard from '@/ui/c-card.vue'
import CSelect from '@/ui/c-select.vue'
import { diff, mask } from './config-diff.service'

const { t } = useI18n()
const theme = useThemeVars()
// Configurations often contain secrets: they stay in this page only, never in the URL.
const before = ref('hostname core1\ninterface GigabitEthernet0/1\n description uplink\n ip address 192.0.2.1 255.255.255.0\nip access-list extended EDGE\n permit tcp any any eq 443\n permit tcp any any eq 22')
const after = ref('hostname core1\ninterface GigabitEthernet0/1\n description uplink to isp\n ip address 192.0.2.1 255.255.255.0\n shutdown\nip access-list extended EDGE\n permit tcp any any eq 22\n permit tcp any any eq 443')
const format = useQueryParam({ name: 'format', defaultValue: 'auto' })
const sections = computed(() => diff(before.value, after.value, format.value as Format))
const formatOptions = computed(() => (['auto', 'indented', 'junos', 'set'] as const).map(f => ({ label: t(`tools.config-diff.formats.${f}`), value: f })))
const asText = () => sections.value.map(s => [`[${s.path || t('tools.config-diff.global')}]${s.reordered ? ` (${t('tools.config-diff.reordered')})` : ''}`, ...s.removed.map(l => `- ${mask(l)}`), ...s.added.map(l => `+ ${mask(l)}`)].join('\n')).join('\n\n')
const counts = computed(() => sections.value.reduce((a, s) => ({ removed: a.removed + s.removed.length, added: a.added + s.added.length }), { removed: 0, added: 0 }))
</script>

<template>
  <CCard>
    <div class="grid gap-x-4 lg:grid-cols-2">
      <NFormItem :label="t('tools.config-diff.before')" :show-feedback="false" class="mb-3">
        <NInput v-model:value="before" type="textarea" :rows="12" class="font-mono" :input-props="{ 'aria-label': t('tools.config-diff.before'), 'spellcheck': false }" data-testid="before" />
      </NFormItem>
      <NFormItem :label="t('tools.config-diff.after')" :show-feedback="false" class="mb-3">
        <NInput v-model:value="after" type="textarea" :rows="12" class="font-mono" :input-props="{ 'aria-label': t('tools.config-diff.after'), 'spellcheck': false }" data-testid="after" />
      </NFormItem>
    </div>
    <CSelect v-model:value="format" :label="t('tools.config-diff.format')" :options="formatOptions" test-id="format" />
    <p class="m-0 text-xs nt-muted">
      {{ t('tools.config-diff.note') }}
    </p>
  </CCard>
  <CCard :title="t('tools.config-diff.summary', { sections: sections.length, removed: counts.removed, added: counts.added })" data-testid="result">
    <NAlert v-if="!sections.length" type="success" class="mb-3">
      {{ t('tools.config-diff.same') }}
    </NAlert>
    <div v-for="s in sections" :key="s.path" class="mb-3" data-testid="section">
      <div class="mb-1 text-sm font-semibold font-mono">
        {{ s.path || t('tools.config-diff.global') }}
        <span v-if="s.reordered" class="nt-muted font-normal">— {{ t('tools.config-diff.reordered') }}</span>
      </div>
      <pre class="m-0 overflow-auto text-xs font-mono" tabindex="0"><span v-for="(l, i) in s.removed" :key="`r${i}`" :style="{ color: theme.errorColor }">- {{ mask(l) }}
</span><span v-for="(l, i) in s.added" :key="`a${i}`" :style="{ color: theme.successColor }">+ {{ mask(l) }}
</span></pre>
    </div>
    <ResultActions v-if="sections.length" :text="asText" :json="sections" filename="config-diff.json" />
  </CCard>
</template>
