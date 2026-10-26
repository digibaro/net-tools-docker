import { describe, expect, it } from 'vitest'
import { lowBudget, rateBudget, recordRateLimit } from './ratelimit'

describe('ratelimit', () => {
  it('records headers and flags a low budget', () => {
    recordRateLimit(new Headers({ 'X-RateLimit-Class': 'heavy', 'X-RateLimit-Limit': '10', 'X-RateLimit-Remaining': '1' }), 1000)
    expect(rateBudget.heavy).toEqual({ limit: 10, remaining: 1, at: 1000 })
    expect(lowBudget(rateBudget.heavy, 2000)).toBe(1)
    expect(lowBudget(rateBudget.heavy, 70_000)).toBeUndefined()
    recordRateLimit(new Headers({}))
    expect(rateBudget.light).toBeUndefined()
  })
})
