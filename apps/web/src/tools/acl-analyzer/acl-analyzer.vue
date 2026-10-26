<script setup lang="ts">
import { NAlert, NFormItem, NInput, NInputNumber } from 'naive-ui'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ResultTable from '@/components/ResultTable.vue'
import CCard from '@/ui/c-card.vue'
import CInputText from '@/ui/c-input-text.vue'
import CSelect from '@/ui/c-select.vue'
import { analyze, parseAcl, trace } from './acl-analyzer.service'

const { t } = useI18n()
// ACLs reveal internal addressing: they stay in the page, not in the link.
const text = ref('ip access-list extended EDGE-IN\n 10 permit tcp any host 192.0.2.10 eq 443\n 20 permit tcp any 192.0.2.0 0.0.0.255 eq www 443\n 30 deny tcp any host 192.0.2.10 eq 443\n 40 permit udp any host 192.0.2.53 eq domain\n 50 permit ip any any\n 60 deny ip host 203.0.113.66 any')
const parsed = computed(() => parseAcl(text.value))
const findings = computed(() => analyze(parsed.value.rules))
const acls = computed(() => [...new Set(parsed.value.rules.map(r => r.acl))])
const acl = ref('')
const proto = ref('tcp')
const src = ref('198.51.100.7')
const dst = ref('192.0.2.10')
const dport = ref<number | null>(443)
const hit = computed(() => trace(parsed.value.rules, acl.value || acls.value[0] || '', { proto: proto.value, src: src.value.trim(), dst: dst.value.trim(), dport: dport.value ?? undefined }))
const k = (key: string) => t(`tools.acl-analyzer.columns.${key}`)
const rows = computed(() => findings.value.map((f, i) => ({ id: String(i), line: f.rule.line, rule: f.rule.text, kind: t(`tools.acl-analyzer.kinds.${f.kind}`), by: f.by ? `${f.by.line}: ${f.by.text}` : '—' })))
const severity = computed(() => (findings.value.some(f => f.kind === 'shadowed') ? 'error' : findings.value.length ? 'warning' : 'success'))
const protoOptions = ['tcp', 'udp', 'icmp', 'ip'].map(p => ({ label: p.toUpperCase(), value: p }))
</script>

<template>
  <CCard>
    <NFormItem :label="t('tools.acl-analyzer.input')" :show-feedback="false" class="mb-1">
      <NInput v-model:value="text" type="textarea" :autosize="{ minRows: 6, maxRows: 20 }" class="font-mono" :input-props="{ 'aria-label': t('tools.acl-analyzer.input'), 'spellcheck': false }" data-testid="input" />
    </NFormItem>
    <p class="m-0 text-xs nt-muted">
      {{ t('tools.acl-analyzer.help', { n: parsed.rules.length }) }}
    </p>
  </CCard>
  <NAlert v-if="parsed.unsupported.length" type="info" class="mb-4">
    {{ t('tools.acl-analyzer.unsupported', { lines: parsed.unsupported.join(', ') }) }}
  </NAlert>
  <CCard :title="t('tools.acl-analyzer.analysis')" data-testid="result">
    <NAlert :type="severity" class="mb-3" data-testid="verdict">
      {{ findings.length ? t('tools.acl-analyzer.found', { n: findings.length }) : t('tools.acl-analyzer.clean') }}
    </NAlert>
    <ResultTable v-if="rows.length" :columns="[{ key: 'line', title: k('line'), width: 60 }, { key: 'rule', title: k('rule'), mono: true, width: 340 }, { key: 'kind', title: k('kind'), width: 160 }, { key: 'by', title: k('by'), mono: true, width: 340 }]" :rows="rows" row-key="id" filename="acl-findings.json" />
  </CCard>
  <CCard :title="t('tools.acl-analyzer.tester')">
    <div class="grid gap-x-4 sm:grid-cols-5">
      <CSelect v-model:value="acl" :label="t('tools.acl-analyzer.acl')" :options="acls.map(a => ({ label: a, value: a }))" :placeholder="acls[0]" test-id="acl" />
      <CSelect v-model:value="proto" :label="t('tools.acl-analyzer.proto')" :options="protoOptions" test-id="proto" />
      <CInputText v-model:value="src" :label="t('tools.acl-analyzer.src')" monospace test-id="src" />
      <CInputText v-model:value="dst" :label="t('tools.acl-analyzer.dst')" monospace test-id="dst" />
      <NFormItem :label="t('tools.acl-analyzer.port')" :show-feedback="false" class="mb-3">
        <NInputNumber v-model:value="dport" :min="0" :max="65535" :show-button="false" :input-props="{ 'aria-label': t('tools.acl-analyzer.port') }" />
      </NFormItem>
    </div>
    <NAlert :type="hit?.action === 'permit' ? 'success' : 'error'" data-testid="trace">
      {{ hit ? t('tools.acl-analyzer.hit', { action: hit.action, line: hit.line, rule: hit.text }) : t('tools.acl-analyzer.implicit') }}
    </NAlert>
  </CCard>
</template>
