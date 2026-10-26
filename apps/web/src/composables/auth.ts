/** Full-page navigation to the OIDC login; the API returns to `next` (an in-app path). */
export function loginUrl(next: string): string {
  return `/api/v1/auth/login?next=${encodeURIComponent(next.startsWith('/') && !next.startsWith('//') ? next : '/')}`
}

/** Short codes the callback puts in ?auth_error= (see the API's auth package). */
export const AUTH_ERRORS = ['state', 'exchange', 'token', 'not_allowed', 'denied', 'idp_unreachable', 'internal'] as const
export const authErrorKey = (code: unknown) => `auth.errors.${(AUTH_ERRORS as readonly unknown[]).includes(code) ? code : 'internal'}`
