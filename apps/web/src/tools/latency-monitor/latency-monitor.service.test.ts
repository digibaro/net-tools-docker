import { describe, expect, it } from 'vitest'
import { buckets, overall } from './latency-monitor.service'

const s = (seq: number, sec: number, rtt: number | null) => ({ seq, at: sec * 1000, rtt })

describe('latency-monitor', () => {
  it('buckets per minute with loss', () => {
    const b = buckets([s(0, 0, 10), s(1, 30, null), s(2, 61, 20), s(3, 90, 30)], 0)
    expect(b).toHaveLength(2)
    expect(b[0]).toMatchObject({ minute: 0, sent: 2, lossPct: 50, avg: 10 })
    expect(b[1]).toMatchObject({ minute: 1, min: 20, max: 30 })
  })
  it('computes jitter and percentiles', () => {
    const o = overall([s(0, 0, 10), s(1, 1, 14), s(2, 2, 10), s(3, 3, null)])
    expect(o).toMatchObject({ sent: 4, received: 3, lossPct: 25, jitter: 4, min: 10, max: 14 })
  })
})
