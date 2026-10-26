import { describe, expect, it } from 'vitest'
import { deterministic, natCapacity } from './nat-capacity-calculator.service'

const base = { subscribers: 1000, sessionsPerSubscriber: 300, publicIps: 16, portLow: 1024, portHigh: 65535, blockSize: 1024 }

describe('nat-capacity-calculator', () => {
  it('computes CGNAT capacity', () => {
    const r = natCapacity(base)
    expect(r.portsPerIp).toBe(64512)
    expect(r.subscribersPerIp).toBe(63)
    expect(r.maxSubscribers).toBe(1008)
    expect(r.ipsNeeded).toBe(16)
    expect(r.fits).toBe(true)
    expect(natCapacity({ ...base, subscribers: 2000 }).fits).toBe(false)
  })
  it('maps subscribers deterministically', () => {
    expect(deterministic(base, 0)).toEqual({ ip: 0, from: 1024, to: 2047 })
    expect(deterministic(base, 63)).toEqual({ ip: 1, from: 1024, to: 2047 })
    expect(deterministic(base, 5000)).toBeUndefined()
  })
})
