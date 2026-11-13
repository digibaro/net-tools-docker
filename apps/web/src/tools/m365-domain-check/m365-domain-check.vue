<script setup lang="ts">
import type { M365Result } from './m365-domain-check.service'
import { NAlert, NButton } from 'naive-ui'
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import ApiError from '@/components/ApiError.vue'
import HealthReport from '@/components/HealthReport.vue'
import ResultTable from '@/components/ResultTable.vue'
import { useApi } from '@/composables/useApi'
import { useQueryParam } from '@/composables/useQueryParam'
import { useValidation } from '@/composables/useValidation'
import CCard from '@/ui/c-card.vue'
import CInputText from '@/ui/c-input-text.vue'
import CKeyValueList from '@/ui/c-key-value-list.vue'
import { isValidQueryName } from '../dns-lookup/dns-lookup.service'
import { m365Checks, recordRows } from './m365-domain-check.service'

const { t } = useI18n()
const domain = useQueryParam({ name: 'domain', defaultValue: '' })
const validation = useValidation({ source: domain, rules: [{ validator: (s: string) => !s || isValidQueryName(s), message: t('tools.dns-lookup.invalidName') }] })
const canRun = computed(() => !!domain.value.trim() && validation.value.isValid)
const { data, error, loading, run } = useApi<M365Result>('/v1/email/m365')
const submit = () => canRun.value && run({ domain: domain.value.trim().replace(/\.$/, '') })
onMounted(() => {
  if (canRun.value)
    void submit()
})
const onM365 = computed(() => !!data.value && (data.value.tenant.found || data.value.usesExchange))
const checks = computed(() => (data.value ? m365Checks(data.value) : []))
const tenantRows = computed(() => {
  const ten = data.value?.tenant
  if (!ten?.found)
    return []
  const ns = ten.namespace ? t(`tools.m365-domain-check.namespace.${ten.namespace}`, ten.namespace) : '—'
  return [
    { label: t('tools.m365-domain-check.fields.tenantId'), value: ten.id, mono: true },
    { label: t('tools.m365-domain-check.fields.brand'), value: ten.brand || '—', noCopy: !ten.brand },
    { label: t('tools.m365-domain-check.fields.region'), value: ten.region || '—', noCopy: true },
    { label: t('tools.m365-domain-check.fields.namespace'), value: ns, noCopy: true },
    ...(ten.federationHost ? [{ label: t('tools.m365-domain-check.fields.federationHost'), value: ten.federationHost, mono: true }] : []),
  ]
})
const title = computed(() => t('tools.m365-domain-check.result', { domain: data.value?.domain ?? '' }))
</script>

<template>
  <CCard>
    <form class="contents" @submit.prevent="submit">
      <CInputText v-model:value="domain" :label="t('email.domain')" placeholder="contoso.com" :validation="validation" monospace test-id="domain" />
      <NButton type="primary" attr-type="submit" :loading="loading" :disabled="!canRun" data-testid="run">
        {{ t('tools.m365-domain-check.run') }}
      </NButton>
      <p class="mb-0 text-xs nt-muted">
        {{ t('tools.m365-domain-check.note') }}
      </p>
    </form>
  </CCard>
  <ApiError v-if="error" :error="error" />
  <template v-if="data">
    <NAlert v-if="!onM365" type="info" :show-icon="true" class="mb-4" data-testid="not-m365">
      {{ t('tools.m365-domain-check.notM365', { domain: data.domain }) }}
    </NAlert>
    <NAlert v-if="data.tenant.error" type="warning" class="mb-4">
      {{ t('tools.m365-domain-check.tenantError', { error: data.tenant.error }) }}
    </NAlert>
    <CCard v-if="data.tenant.found" :title="t('tools.m365-domain-check.tenant')" data-testid="tenant">
      <CKeyValueList :rows="tenantRows" />
    </CCard>
    <CCard :title="title" data-testid="result">
      <HealthReport :checks="checks" prefix="tools.m365-domain-check" :title="title" filename="m365-domain-check.json" />
    </CCard>
    <CCard :title="t('tools.m365-domain-check.records')" data-testid="records">
      <ResultTable
        :columns="[
          { key: 'name', title: t('tools.m365-domain-check.columns.name'), mono: true, width: 240 },
          { key: 'type', title: t('tools.m365-domain-check.columns.type'), width: 80 },
          { key: 'expected', title: t('tools.m365-domain-check.columns.expected'), mono: true, width: 300 },
          { key: 'found', title: t('tools.m365-domain-check.columns.found'), mono: true, width: 300 },
        ]"
        :rows="recordRows(data)"
        row-key="id"
        filename="m365-records.json"
        :label="t('tools.m365-domain-check.records')"
      />
    </CCard>
  </template>
</template>
