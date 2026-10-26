<script setup lang="ts">
import type { ApiError } from '@/api/client'
import { NAlert } from 'naive-ui'
import { computed, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ error: ApiError }>()
const { t, te } = useI18n()

const title = computed(() => {
  const key = `apiErrors.${props.error.code}`
  return te(key) ? t(key) : t('apiErrors.INTERNAL')
})
// RATE_LIMITED and BUSY carry retryAfter (seconds): count down so the user knows when to retry.
const wait = ref(typeof props.error.details.retryAfter === 'number' ? props.error.details.retryAfter : 0)
const timer = wait.value > 0 ? setInterval(() => (wait.value = Math.max(0, wait.value - 1)), 1000) : undefined
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <NAlert type="error" :title="title" class="mb-4" data-testid="api-error">
    <span>{{ error.message }}</span>
    <code class="ml-2 text-xs opacity-70">{{ error.code }}</code>
    <div v-if="wait > 0" class="mt-1 text-sm" data-testid="retry-after">
      {{ t('apiErrors.retryIn', { s: wait }) }}
    </div>
    <div v-else-if="typeof error.details.retryAfter === 'number'" class="mt-1 text-sm" data-testid="retry-after">
      {{ t('apiErrors.retryNow') }}
    </div>
  </NAlert>
</template>
