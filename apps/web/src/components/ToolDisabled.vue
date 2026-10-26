<script setup lang="ts">
import { NAlert, NButton } from 'naive-ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { loginUrl } from '@/composables/auth'

const props = defineProps<{ reason: string }>()
const { t, te } = useI18n()
const route = useRoute()
const signIn = () => window.location.assign(loginUrl(route.fullPath))
const text = computed(() => {
  const key = `capabilities.reasons.${props.reason}`
  return te(key) ? t(key) : t('capabilities.reasons.unavailable')
})
</script>

<template>
  <NAlert type="warning" :title="t('capabilities.disabledTitle')" class="mb-4" data-testid="tool-disabled">
    {{ text }}
    <div v-if="reason === 'login_required'" class="mt-2">
      <NButton size="small" type="primary" data-testid="tool-sign-in" @click="signIn">
        {{ t('auth.signIn') }}
      </NButton>
    </div>
  </NAlert>
</template>
