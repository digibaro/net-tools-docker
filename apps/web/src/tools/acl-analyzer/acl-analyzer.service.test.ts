import { describe, expect, it } from 'vitest'
import { analyze, parseAcl, trace } from './acl-analyzer.service'

const IOS = `ip access-list extended EDGE-IN
 10 permit tcp any host 192.0.2.10 eq 443
 20 permit tcp any 192.0.2.0 0.0.0.255 eq www 443
 30 deny tcp any host 192.0.2.10 eq 443
 40 permit tcp any any established
 50 permit udp any host 192.0.2.53 eq domain
 60 permit ip any any
 70 deny ip host 203.0.113.66 any
 remark this line is ignored`
const ASA = 'access-list OUTSIDE extended permit tcp any 10.0.0.0 255.255.255.0 range 8000 8100\naccess-list OUTSIDE extended permit tcp any 10.0.0.0 255.255.255.0 eq 8080'

describe('acl-analyzer', () => {
  it('parses IOS and ASA syntax', () => {
    const { rules, unsupported } = parseAcl(`${IOS}\n${ASA}\n permit tcp object-group X any`)
    expect(rules).toHaveLength(9)
    expect(rules[1]!.dports).toEqual([[80, 80], [443, 443]])
    expect(rules[7]!.dst.prefix).toBe(24)
    expect(unsupported).toEqual([12])
  })
  it('finds shadowed, redundant and wide rules', () => {
    const f = analyze(parseAcl(`${IOS}\n${ASA}`).rules)
    const byLine = Object.fromEntries(f.map(x => [x.rule.line, `${x.kind}${x.by ? `@${x.by.line}` : ''}`]))
    expect(byLine[4]).toBe('shadowed@2')
    expect(byLine[7]).toBe('wide')
    expect(byLine[8]).toBe('shadowed@7')
    expect(byLine[11]).toBe('redundant@10')
    expect(byLine[3]).toBeUndefined()
  })
  it('traces a packet', () => {
    const { rules } = parseAcl(IOS)
    expect(trace(rules, 'EDGE-IN', { proto: 'tcp', src: '198.51.100.1', dst: '192.0.2.10', dport: 443 })!.line).toBe(2)
    expect(trace(rules, 'EDGE-IN', { proto: 'udp', src: '198.51.100.1', dst: '192.0.2.53', dport: 53 })!.line).toBe(6)
    expect(trace(parseAcl('ip access-list extended X\n permit tcp any any eq 22').rules, 'X', { proto: 'udp', src: '1.1.1.1', dst: '2.2.2.2', dport: 53 })).toBeUndefined()
  })
})
