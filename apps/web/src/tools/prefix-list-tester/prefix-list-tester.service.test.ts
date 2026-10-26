import { describe, expect, it } from 'vitest'
import { parseCidr } from '@/utils/ip'
import { evaluate, parseLists } from './prefix-list-tester.service'

const IOS = `ip prefix-list CUST seq 5 deny 10.0.0.0/8 le 32
ip prefix-list CUST seq 10 permit 192.0.2.0/24
ip prefix-list CUST seq 20 permit 198.51.100.0/22 ge 23 le 24
ip prefix-list CUST seq 30 permit 0.0.0.0/0 ge 25`
const r = (s: string) => parseCidr(s, { allowBare: false })!

describe('prefix-list-tester', () => {
  it('evaluates Cisco prefix-lists in sequence order', () => {
    const { entries } = parseLists(IOS)
    expect(evaluate(entries, r('10.1.0.0/16'))[0]).toMatchObject({ result: 'deny', entry: { seq: 5 } })
    expect(evaluate(entries, r('192.0.2.0/24'))[0]!.result).toBe('permit')
    expect(evaluate(entries, r('192.0.2.0/25'))[0]!.entry!.seq).toBe(30) // /25 is not exact 192.0.2.0/24
    expect(evaluate(entries, r('198.51.100.0/22'))[0]).toMatchObject({ result: 'deny', entry: undefined })
    expect(evaluate(entries, r('198.51.101.0/24'))[0]!.result).toBe('permit')
  })
  it('handles Junos route-filter and prefix-list', () => {
    const { entries, invalid } = parseLists(`route-filter 203.0.113.0/24 upto /26 accept;
route-filter 0.0.0.0/0 prefix-length-range /25-/32 reject;
prefix-list TRANSIT {
    2001:db8::/32;
}
set policy-options prefix-list LOOPBACKS 192.0.2.1/32`)
    expect(invalid).toEqual([])
    expect(evaluate(entries, r('203.0.113.64/26')).find(m => m.list === 'route-filter')!.result).toBe('permit')
    expect(evaluate(entries, r('203.0.113.128/27')).find(m => m.list === 'route-filter')!.result).toBe('deny')
    expect(evaluate(entries, r('2001:db8::/32')).find(m => m.list === 'TRANSIT')!.result).toBe('permit')
    expect(evaluate(entries, r('192.0.2.1/32')).find(m => m.list === 'LOOPBACKS')!.result).toBe('permit')
  })
})
