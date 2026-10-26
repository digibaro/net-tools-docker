<script setup lang="ts">
import { Login, Logout, UserCircle } from '@vicons/tabler'
import { NButton, NDropdown, NIcon, NTooltip, useMessage } from 'naive-ui'
import { computed, h, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { apiPost } from '@/api/client'
import { authErrorKey, loginUrl } from '@/composables/auth'
import { useCapabilitiesStore } from '@/stores/capabilities.store'

const { t } = useI18n()
const caps = useCapabilitiesStore()
const route = useRoute()
const router = useRouter()
const message = useMessage()
const auth = computed(() => caps.capabilities?.auth)
const user = computed(() => auth.value?.user ?? undefined)

// A failed login comes back as /?auth_error=<code>: explain it once and drop the parameter.
watch(() => route.query.auth_error, (code) => {
  if (!code)
    return
  message.error(t(authErrorKey(code)), { duration: 8000 })
  const { auth_error: _, ...query } = route.query
  void router.replace({ query })
}, { immediate: true })

const signIn = () => window.location.assign(loginUrl(route.fullPath))
async function signOut() {
  const res = await apiPost<{ logoutUrl: string }>('/v1/auth/logout', {}).catch(() => undefined)
  if (res?.logoutUrl)
    window.location.assign(res.logoutUrl)
  else
    window.location.reload()
}
const options = computed(() => [
  { key: 'who', type: 'render', render: () => h('div', { class: 'px-3 py-2 text-sm' }, [h('div', { class: 'font-semibold' }, user.value?.name), h('div', { class: 'nt-muted text-xs' }, `${user.value?.email ?? ''} · ${t(`auth.roles.${user.value?.role}`)}`)]) },
  { type: 'divider', key: 'd' },
  { key: 'logout', label: t('auth.signOut'), icon: () => h(NIcon, { component: Logout }) },
])
</script>

<template>
  <template v-if="auth?.mode === 'oidc'">
    <NDropdown v-if="user" trigger="click" :options="options" @select="(k: string) => k === 'logout' && signOut()">
      <NButton quaternary circle :aria-label="t('auth.account', { name: user.name })" data-testid="account">
        <template #icon>
          <NIcon aria-hidden="true" :component="UserCircle" />
        </template>
      </NButton>
    </NDropdown>
    <NTooltip v-else>
      <template #trigger>
        <NButton quaternary circle :aria-label="t('auth.signIn')" data-testid="sign-in" @click="signIn">
          <template #icon>
            <NIcon aria-hidden="true" :component="Login" />
          </template>
        </NButton>
      </template>
      {{ t('auth.signIn') }}
    </NTooltip>
  </template>
</template>
