<script setup lang="ts">
import { provide } from 'vue'
import { QUERY_SCOPE } from '@/composables/queryScope'

const props = defineProps<{ prefix: string, path: string }>()
provide(QUERY_SCOPE, { prefix: props.prefix, path: props.path })
</script>

<template>
  <slot />
</template>
