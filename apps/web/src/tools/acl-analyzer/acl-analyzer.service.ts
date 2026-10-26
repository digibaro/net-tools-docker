import type { Cidr } from '@/utils/ip'
import { cidrContains, parseCidr, parseIP, parseIPv4 } from '@/utils/ip'

export type Range = [number, number]
export interface Rule { acl: string, index: number, line: number, text: string, action: 'permit' | 'deny', proto: string, src: Cidr, dst: Cidr, sports?: Range[], dports?: Range[], established: boolean }
export interface Finding { rule: Rule, kind: 'shadowed' | 'redundant' | 'wide', by?: Rule }

const PORTS: Record<string, number> = { 'ftp': 21, 'ftp-data': 20, 'ssh': 22, 'telnet': 23, 'smtp': 25, 'domain': 53, 'bootps': 67, 'bootpc': 68, 'tftp': 69, 'www': 80, 'http': 80, 'pop3': 110, 'ntp': 123, 'netbios-ns': 137, 'imap4': 143, 'snmp': 161, 'snmptrap': 162, 'bgp': 179, 'ldap': 389, 'https': 443, 'isakmp': 500, 'syslog': 514, 'ldaps': 636, 'sqlnet': 1521, 'rdp': 3389, 'sip': 5060 }
const PROTOS = ['ip', 'tcp', 'udp', 'icmp', 'esp', 'ahp', 'gre', 'ospf', 'eigrp', 'pim', 'igmp', 'ipv6', 'icmpv6']
const ANY4 = parseCidr('0.0.0.0/0', { allowBare: false })!
const ANY6 = parseCidr('::/0', { allowBare: false })!
const port = (s: string) => (/^\d+$/.test(s) ? Number(s) : PORTS[s])

/** IOS wildcard (0.0.0.255) or ASA netmask (255.255.255.0) → prefix length, contiguous masks only. */
function maskLen(mask: string, wildcard: boolean): number | undefined {
  const v = parseIPv4(mask)
  if (v === undefined)
    return undefined
  const m = wildcard ? ~Number(v) >>> 0 : Number(v)
  const len = 32 - Math.log2((~m >>> 0) + 1)
  return Number.isInteger(len) ? len : undefined
}

/** Reads an address spec at tokens[i]; returns the prefix and the number of tokens used. */
function addr(t: string[], i: number, asa: boolean): [Cidr, number] | undefined {
  const w = t[i]
  if (w === 'any' || w === 'any4')
    return [ANY4, 1]
  if (w === 'any6')
    return [ANY6, 1]
  if (w === 'host' && t[i + 1] && parseIP(t[i + 1]!)) {
    const ip = parseIP(t[i + 1]!)!
    return [parseCidr(`${t[i + 1]}/${ip.version === 4 ? 32 : 128}`, { allowBare: false })!, 2]
  }
  if (w?.includes('/')) {
    const c = parseCidr(w, { allowBare: false })
    return c ? [c, 1] : undefined
  }
  if (w && t[i + 1] && parseIPv4(w) !== undefined) {
    const len = maskLen(t[i + 1]!, !asa)
    return len === undefined ? undefined : [parseCidr(`${w}/${len}`, { allowBare: false })!, 2]
  }
  return undefined
}

function ports(t: string[], i: number): [Range[] | undefined, number] {
  const op = t[i]
  if (op === 'eq') {
    const out: Range[] = []
    let n = i + 1
    while (t[n] !== undefined && port(t[n]!) !== undefined) {
      out.push([port(t[n]!)!, port(t[n]!)!])
      n++
    }
    return [out, n - i]
  }
  const p = port(t[i + 1] ?? '')
  if (op === 'range' && p !== undefined && port(t[i + 2] ?? '') !== undefined)
    return [[[p, port(t[i + 2]!)!]], 3]
  if (op === 'gt' && p !== undefined)
    return [[[p + 1, 65535]], 2]
  if (op === 'lt' && p !== undefined)
    return [[[0, p - 1]], 2]
  if (op === 'neq' && p !== undefined)
    return [[[0, p - 1], [p + 1, 65535]], 2]
  return [undefined, 0]
}

export function parseAcl(text: string): { rules: Rule[], unsupported: number[] } {
  const rules: Rule[] = []
  const unsupported: number[] = []
  let current = ''
  let index = 0
  text.split('\n').forEach((raw, li) => {
    let line = raw.trim()
    if (!line || line.startsWith('!') || /\bremark\b/.test(line))
      return
    const named = /^(?:ip|ipv6) access-list (?:extended |standard )?(\S+)$/.exec(line)
    if (named) {
      current = named[1]!
      return
    }
    let acl = current
    let asa = false
    const numbered = /^access-list (\S+) (?:(extended) )?(?:line \d+ )?(.*)$/.exec(line)
    if (numbered) {
      acl = numbered[1]!
      asa = !!numbered[2]
      line = numbered[3]!
    }
    const t = line.replace(/^\d+\s+/, '').split(/\s+/)
    if (t[0] !== 'permit' && t[0] !== 'deny')
      return void unsupported.push(li + 1)
    let i = 1
    const proto = PROTOS.includes(t[i]!) || /^\d+$/.test(t[i]!) ? t[i++]! : ''
    const src = addr(t, i, asa)
    if (!proto || !src)
      return void unsupported.push(li + 1)
    i += src[1]
    const [sports, sn] = proto === 'tcp' || proto === 'udp' ? ports(t, i) : [undefined, 0]
    i += sn
    const dst = addr(t, i, asa)
    if (!dst)
      return void unsupported.push(li + 1)
    i += dst[1]
    const [dports, dn] = proto === 'tcp' || proto === 'udp' ? ports(t, i) : [undefined, 0]
    i += dn
    rules.push({ acl: acl || 'ACL', index: index++, line: li + 1, text: raw.trim(), action: t[0], proto, src: src[0], dst: dst[0], sports, dports, established: t.slice(i).includes('established') })
  })
  return { rules, unsupported }
}

const within = (inner: Range[] | undefined, outer: Range[] | undefined) => !outer || (!!inner && inner.every(([a, b]) => outer.some(([c, d]) => c <= a && b <= d)))
const containsCidr = (outer: Cidr, inner: Cidr) => outer.version === inner.version && outer.prefix <= inner.prefix && cidrContains(outer, { version: inner.version, value: inner.network })

/** Does rule a match every packet rule b matches? */
export function covers(a: Rule, b: Rule): boolean {
  const proto = a.proto === 'ip' || a.proto === 'ipv6' || a.proto === b.proto
  return proto && containsCidr(a.src, b.src) && containsCidr(a.dst, b.dst) && (a.proto === 'ip' || a.proto === 'ipv6' || (within(b.sports, a.sports) && within(b.dports, a.dports))) && (!a.established || b.established)
}

export function analyze(rules: Rule[]): Finding[] {
  const out: Finding[] = []
  for (const [j, b] of rules.entries()) {
    const by = rules.slice(0, j).find(a => a.acl === b.acl && covers(a, b))
    if (by)
      out.push({ rule: b, kind: by.action === b.action ? 'redundant' : 'shadowed', by })
    else if (b.action === 'permit' && b.src.prefix === 0 && b.dst.prefix === 0 && (b.proto === 'ip' || b.proto === 'ipv6' || !b.dports))
      out.push({ rule: b, kind: 'wide' })
  }
  return out
}

export interface Packet { proto: string, src: string, dst: string, dport?: number }
/** First matching rule of one ACL; undefined = implicit deny. */
export function trace(rules: Rule[], acl: string, p: Packet): Rule | undefined {
  const s = parseIP(p.src)
  const d = parseIP(p.dst)
  if (!s || !d)
    return undefined
  return rules.filter(r => r.acl === acl).find(r =>
    (r.proto === 'ip' || r.proto === 'ipv6' || r.proto === p.proto)
    && cidrContains(r.src, s) && cidrContains(r.dst, d)
    && (!r.dports || (p.dport !== undefined && r.dports.some(([a, b]) => a <= p.dport! && p.dport! <= b)))
    && !r.established)
}
