import type { Cidr } from '@/utils/ip'
import { bitLength, cidrContains, parseCidr } from '@/utils/ip'

export interface Entry { list: string, seq: number, action: 'permit' | 'deny', prefix: Cidr, min: number, max: number, text: string }
export interface Match { list: string, result: 'permit' | 'deny', entry?: Entry }

/**
 * Cisco "ip|ipv6 prefix-list NAME [seq N] permit|deny P [ge X] [le Y]"; Junos "route-filter P exact|orlonger|longer|upto /N|prefix-length-range /A-/B [accept|reject]"
 * and "prefix-list NAME P" (set style) or "P;" inside "prefix-list NAME { … }" (exact match).
 */
export function parseLists(text: string): { entries: Entry[], invalid: number[] } {
  const entries: Entry[] = []
  const invalid: number[] = []
  let braceList = ''
  const seqs = new Map<string, number>()
  const nextSeq = (list: string) => {
    const n = (seqs.get(list) ?? 0) + 5
    seqs.set(list, n)
    return n
  }
  text.split('\n').forEach((raw, i) => {
    const line = raw.trim().replace(/;$/, '')
    if (!line || line.startsWith('!') || line.startsWith('#'))
      return
    const ios = /^(?:ipv6|ip) prefix-list (\S+) (?:seq (\d+) )?(permit|deny) (\S+)(?: ge (\d+))?(?: le (\d+))?$/i.exec(line)
    if (ios) {
      const p = parseCidr(ios[4]!, { allowBare: false })
      if (!p)
        return void invalid.push(i + 1)
      const ge = ios[5] ? Number(ios[5]) : undefined
      const le = ios[6] ? Number(ios[6]) : undefined
      const min = ge ?? p.prefix
      const max = le ?? (ge !== undefined ? bitLength(p.version) : p.prefix)
      const seq = ios[2] ? Number(ios[2]) : nextSeq(ios[1]!)
      if (ios[2])
        seqs.set(ios[1]!, Math.max(seqs.get(ios[1]!) ?? 0, seq))
      entries.push({ list: ios[1]!, seq, action: ios[3]!.toLowerCase() as Entry['action'], prefix: p, min, max, text: line })
      return
    }
    const rf = /^(?:set .*?)?route-filter (\S+) (exact|orlonger|longer|upto \/(\d+)|prefix-length-range \/(\d+)-\/(\d+))(?: (accept|reject))?$/.exec(line)
    if (rf) {
      const p = parseCidr(rf[1]!, { allowBare: false })
      if (!p)
        return void invalid.push(i + 1)
      const bits = bitLength(p.version)
      const [min, max] = rf[2] === 'exact' ? [p.prefix, p.prefix] : rf[2] === 'orlonger' ? [p.prefix, bits] : rf[2] === 'longer' ? [p.prefix + 1, bits] : rf[3] ? [p.prefix, Number(rf[3])] : [Number(rf[4]), Number(rf[5])]
      entries.push({ list: 'route-filter', seq: nextSeq('route-filter'), action: rf[6] === 'reject' ? 'deny' : 'permit', prefix: p, min, max, text: line })
      return
    }
    const setList = /^set policy-options prefix-list (\S+) (\S+)$/.exec(line)
    const open = /^(?:policy-options \{ )?prefix-list (\S+) \{$/.exec(line)
    if (open) {
      braceList = open[1]!
      return
    }
    if (line === '}') {
      braceList = ''
      return
    }
    const bare = braceList ? parseCidr(line, { allowBare: false }) : undefined
    const list = setList ? setList[1]! : braceList
    const p = setList ? parseCidr(setList[2]!, { allowBare: false }) : bare
    if (p && list) {
      entries.push({ list, seq: nextSeq(list), action: 'permit', prefix: p, min: p.prefix, max: p.prefix, text: line })
      return
    }
    invalid.push(i + 1)
  })
  return { entries, invalid }
}

/** First matching entry per list in sequence order; no match = implicit deny. */
export function evaluate(entries: Entry[], route: Cidr): Match[] {
  const lists = [...new Set(entries.map(e => e.list))]
  return lists.map((list) => {
    const hit = entries.filter(e => e.list === list).sort((a, b) => a.seq - b.seq).find(e =>
      e.prefix.version === route.version && route.prefix >= e.prefix.prefix && cidrContains(e.prefix, { version: route.version, value: route.network }) && route.prefix >= e.min && route.prefix <= e.max)
    return { list, result: hit?.action ?? 'deny', entry: hit }
  })
}
