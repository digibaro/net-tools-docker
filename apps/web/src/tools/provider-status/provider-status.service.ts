import type { components } from '@/api/schema'

export type ProviderStatus = components['schemas']['ProviderStatus']
export type Provider = ProviderStatus['providers'][number]
export type State = 'ok' | 'failing' | 'no-key' | 'unused'

/** failing: the last call failed after the last success; no-key: needs a key that is not set. */
export function state(p: Provider): State {
  if (p.secret && !p.keyOptional && !p.keyConfigured)
    return 'no-key'
  if (p.lastError && (!p.lastOk || p.lastError > p.lastOk))
    return 'failing'
  return p.fetches || p.requests ? 'ok' : 'unused'
}

/** Share of requests answered from the cache. */
export const cacheRate = (p: Provider) => (p.requests ? Math.round((1 - p.fetches / p.requests) * 100) : 0)
