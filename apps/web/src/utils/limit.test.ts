import { describe, expect, it } from 'vitest'
import { limiter } from './limit'

describe('limiter', () => {
  it('never runs more than n at once and keeps order', async () => {
    const limit = limiter(2)
    let running = 0
    let peak = 0
    const started: number[] = []
    const job = (i: number) => limit(async () => {
      started.push(i)
      running++
      peak = Math.max(peak, running)
      await new Promise(r => setTimeout(r, 5))
      running--
      if (i === 3)
        throw new Error('boom')
      return i
    })
    const results = await Promise.allSettled([1, 2, 3, 4, 5].map(job))
    expect(peak).toBe(2)
    expect(started).toEqual([1, 2, 3, 4, 5])
    expect(results.map(r => r.status)).toEqual(['fulfilled', 'fulfilled', 'rejected', 'fulfilled', 'fulfilled'])
  })
})
