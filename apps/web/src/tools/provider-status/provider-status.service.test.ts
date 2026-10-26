import type { Provider } from './provider-status.service'
import { describe, expect, it } from 'vitest'
import { cacheRate, state } from './provider-status.service'

const p = (x: Partial<Provider>) => ({ name: 'x', secret: '', keyConfigured: false, keyOptional: false, requests: 0, fetches: 0, errors: 0, lastOk: null, lastError: null, lastProblem: '', lastLatencyMs: 0, ...x }) as Provider

describe('provider-status', () => {
  it('derives the state', () => {
    expect(state(p({ secret: 'ABUSEIPDB_KEY' }))).toBe('no-key')
    expect(state(p({ secret: 'PEERINGDB_KEY', keyOptional: true }))).toBe('unused')
    expect(state(p({ requests: 3, fetches: 1, lastOk: '2026-10-27T10:00:00Z', lastError: '2026-10-27T11:00:00Z' }))).toBe('failing')
    expect(state(p({ requests: 3, fetches: 1, lastOk: '2026-10-27T12:00:00Z', lastError: '2026-10-27T11:00:00Z' }))).toBe('ok')
    expect(cacheRate(p({ requests: 4, fetches: 1 }))).toBe(75)
  })
})
