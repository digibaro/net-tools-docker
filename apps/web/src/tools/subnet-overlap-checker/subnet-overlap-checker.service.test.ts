import { describe, expect, it } from 'vitest'
import { findOverlaps, parseEntries } from './subnet-overlap-checker.service'

const INPUT = `# Site A
10.0.0.0/16
192.168.1.0/24
# Site B
10.0.20.0/24
192.168.1.0/24 office
172.16.0.0/12
VPN: 2001:db8::/48
cloud: 2001:db8:0:10::/64
bad line here`

describe('subnet-overlap-checker', () => {
  it('parses labels and groups', () => {
    const { entries, invalid } = parseEntries(INPUT)
    expect(entries.map(e => e.label)).toEqual(['Site A', 'Site A', 'Site B', 'office', 'Site B', 'VPN', 'cloud'])
    expect(invalid).toEqual([10])
  })
  it('finds identical and nested prefixes across labels', () => {
    const o = findOverlaps(parseEntries(INPUT).entries)
    expect(o.map(x => `${x.a.text}>${x.b.text}:${x.relation}`)).toEqual(['10.0.0.0/16>10.0.20.0/24:contains', '192.168.1.0/24>192.168.1.0/24:identical', '2001:db8::/48>2001:db8:0:10::/64:contains'])
  })
  it('can include overlaps within one label', () => {
    const { entries } = parseEntries('10.0.0.0/8 a\n10.1.0.0/16 a')
    expect(findOverlaps(entries)).toHaveLength(0)
    expect(findOverlaps(entries, true)).toHaveLength(1)
  })
})
