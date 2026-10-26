import { describe, expect, it } from 'vitest'
import { bulge, fresnelMid, fspl, link } from './wireless-link-calculator.service'

describe('wireless-link-calculator', () => {
  it('matches the textbook values', () => {
    expect(fspl(1, 2.4)).toBeCloseTo(100.04, 1)
    expect(fspl(10, 5.8)).toBeCloseTo(127.71, 1)
    expect(fresnelMid(10, 5.8)).toBeCloseTo(11.37, 1)
    expect(bulge(10)).toBeCloseTo(1.47, 1)
  })
  it('computes the link budget', () => {
    const r = link({ freqGHz: 5.8, distanceKm: 10, txDbm: 20, txGainDbi: 23, rxGainDbi: 23, cableLossDb: 1, sensitivityDbm: -80 })
    expect(r.eirpDbm).toBe(42)
    expect(r.rxDbm).toBeCloseTo(-63.7, 1)
    expect(r.marginDb).toBeCloseTo(16.3, 1)
  })
})
