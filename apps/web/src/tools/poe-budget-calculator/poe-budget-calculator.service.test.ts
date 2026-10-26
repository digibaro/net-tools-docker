import { describe, expect, it } from 'vitest'
import { budget, parseDevices } from './poe-budget-calculator.service'

describe('poe-budget-calculator', () => {
  it('reserves per class or per measured draw', () => {
    const d = parseDevices('Access point, 4, 6\nCamera, 3, 10, 7.5\nPhone, 2, 20')
    expect(d).toHaveLength(3)
    const c = budget(d, 370, 'class')
    expect(c.allocated).toBe(6 * 30 + 10 * 15.4 + 20 * 7)
    expect(c.over).toBe(true)
    const l = budget(d, 370, 'lldp')
    expect(l.allocated).toBeLessThan(c.allocated)
    expect(l.ports).toBe(36)
  })
  it('ignores unknown classes', () => {
    expect(parseDevices('x, 9, 1')).toEqual([])
  })
})
