import { describe, expect, it } from 'vitest'
import { detect, diff, mask } from './config-diff.service'

const A = `!
! Last configuration change at 10:00:00 UTC
version 17.9
hostname core1
interface GigabitEthernet0/1
 description uplink
 ip address 192.0.2.1 255.255.255.0
 no shutdown
interface GigabitEthernet0/2
 shutdown
ip access-list extended EDGE
 permit tcp any any eq 443
 permit tcp any any eq 22
username admin secret 9 $9$abc
`
const B = `!
! Last configuration change at 11:30:00 UTC
version 17.9
hostname core1
interface GigabitEthernet0/2
 shutdown
interface GigabitEthernet0/1
 description uplink to isp
 ip address 192.0.2.1 255.255.255.0
 no shutdown
ip access-list extended EDGE
 permit tcp any any eq 22
 permit tcp any any eq 443
`

describe('config-diff', () => {
  it('diffs per section, ignoring order and timestamps', () => {
    const d = diff(A, B)
    expect(d.find(s => s.path === 'interface GigabitEthernet0/1')).toMatchObject({ removed: ['description uplink'], added: ['description uplink to isp'] })
    expect(d.find(s => s.path === 'ip access-list extended EDGE')!.reordered).toBe(true)
    expect(d.find(s => s.path === '')!.removed).toEqual(['username admin secret 9 $9$abc'])
    expect(d.some(s => s.path.startsWith('interface GigabitEthernet0/2'))).toBe(false)
  })
  it('handles Junos braces and set style', () => {
    const j1 = 'system {\n    host-name r1;\n}\ninterfaces {\n    ge-0/0/0 {\n        unit 0 {\n            family inet {\n                address 192.0.2.1/24;\n            }\n        }\n    }\n}'
    const j2 = j1.replace('192.0.2.1/24', '192.0.2.2/24')
    expect(detect(j1)).toBe('junos')
    expect(diff(j1, j2)[0]).toMatchObject({ path: 'interfaces › ge-0/0/0 › unit 0 › family inet', removed: ['address 192.0.2.1/24'], added: ['address 192.0.2.2/24'] })
    expect(diff('set system host-name r1', 'set system host-name r2')).toHaveLength(1)
  })
  it('masks secrets', () => {
    expect(mask('username admin secret 9 $9$abc')).toBe('username admin secret 9 ********')
    expect(mask('snmp-server community s3cret RO')).toBe('snmp-server community ******** RO')
  })
})
