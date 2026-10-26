export type Kind = 'standard' | 'large' | 'extended'
export interface Decoded { input: string, kind: Kind, value: string, meaning: string, detail: string, valid: boolean }

const WELL_KNOWN: Record<number, [string, string]> = {
  0x0000: ['GRACEFUL_SHUTDOWN', 'RFC 8326: lower the local preference before maintenance (when high part is 65535)'],
  0x0001: ['ACCEPT_OWN', 'RFC 7611'],
  0x0002: ['ROUTE_FILTER_TRANSLATED_v4', 'draft-l3vpn-legacy-rtc'],
  0x0006: ['LLGR_STALE', 'RFC 9494: long-lived graceful restart, stale route'],
  0x0007: ['NO_LLGR', 'RFC 9494'],
  0x029A: ['BLACKHOLE', 'RFC 7999: discard traffic to this prefix (remote-triggered blackhole)'],
  0xFF01: ['NO_EXPORT', 'RFC 1997: do not advertise outside the AS or confederation'],
  0xFF02: ['NO_ADVERTISE', 'RFC 1997: do not advertise to any peer'],
  0xFF03: ['NO_EXPORT_SUBCONFED', 'RFC 1997: do not advertise to external peers, not even inside the confederation'],
  0xFF04: ['NOPEER', 'RFC 3765: do not advertise to bilateral peers'],
}
const NAMES = Object.fromEntries(Object.values(WELL_KNOWN).map(([n], i) => [n.toLowerCase(), Number(Object.keys(WELL_KNOWN)[i])]))
Object.assign(NAMES, { 'no-export': 0xFF01, 'no-advertise': 0xFF02, 'local-as': 0xFF03, 'no-export-subconfed': 0xFF03, 'blackhole': 0x029A, 'graceful-shutdown': 0x0000, 'internet': -1 })

/** What an AS number in a community usually is. */
export function asnClass(asn: number, bits: 16 | 32): string {
  if (asn === 0)
    return 'reserved (0)'
  if (bits === 16 && asn >= 64512 && asn <= 65534)
    return 'private ASN'
  if (bits === 16 && asn >= 64496 && asn <= 64511)
    return 'documentation ASN'
  if (bits === 32 && asn >= 4200000000 && asn <= 4294967294)
    return 'private ASN'
  if (bits === 32 && asn >= 65536 && asn <= 65551)
    return 'documentation ASN'
  if (asn === 23456)
    return 'AS_TRANS'
  return `AS${asn}`
}

function standard(input: string, hi: number, lo: number): Decoded {
  const value = `${hi}:${lo}`
  if (hi === 65535 && WELL_KNOWN[lo])
    return { input, kind: 'standard', value, meaning: WELL_KNOWN[lo]![0], detail: WELL_KNOWN[lo]![1], valid: true }
  if (hi === 0)
    return { input, kind: 'standard', value, meaning: 'route server: do not announce to this peer', detail: `0:${lo} is the common IXP route-server convention: do not announce to AS${lo}${lo === 0 ? ' (0:0 = to nobody)' : ''}`, valid: true }
  if (hi === 65535)
    return { input, kind: 'standard', value, meaning: 'reserved well-known range', detail: '65535:x values are reserved by IANA', valid: true }
  return { input, kind: 'standard', value, meaning: `${asnClass(hi, 16)}, value ${lo}`, detail: 'meaning is defined by that network — see its community documentation (often in its IRR aut-num or PeeringDB entry)', valid: true }
}

const EXT_TYPES: Record<string, string> = {
  '00:02': 'route target (2-byte AS)',
  '01:02': 'route target (IPv4)',
  '02:02': 'route target (4-byte AS)',
  '00:03': 'route origin / site of origin (2-byte AS)',
  '01:03': 'site of origin (IPv4)',
  '02:03': 'site of origin (4-byte AS)',
  '00:05': 'OSPF domain identifier',
  '01:0b': 'VRF route import',
  '03:0c': 'BGP encapsulation',
  '43:00': 'link bandwidth',
  '80:06': 'flowspec traffic-rate',
  '80:07': 'flowspec traffic-action',
  '80:08': 'flowspec redirect (2-byte AS)',
  '80:09': 'flowspec traffic-marking (DSCP)',
  '40:04': 'EVPN-ish: transitive opaque',
  '03:0d': 'default gateway',
  '06:00': 'EVPN MAC mobility',
  '06:01': 'EVPN ESI label',
  '06:02': 'EVPN ES-import RT',
  '06:03': 'EVPN router MAC',
}

function fromHex(input: string, hex: string): Decoded {
  const b = hex.match(/../g)!.map(x => Number.parseInt(x, 16))
  const key = `${hex.slice(0, 2)}:${hex.slice(2, 4)}`
  const name = EXT_TYPES[key] ?? `type 0x${hex.slice(0, 2)} subtype 0x${hex.slice(2, 4)}`
  const t = b[0]! & 0x3F
  let value = hex
  if (t === 0x00)
    value = `${(b[2]! << 8) | b[3]!}:${((b[4]! << 24) >>> 0) + (b[5]! << 16) + (b[6]! << 8) + b[7]!}`
  else if (t === 0x01)
    value = `${b[2]}.${b[3]}.${b[4]}.${b[5]}:${(b[6]! << 8) | b[7]!}`
  else if (t === 0x02)
    value = `${((b[2]! << 24) >>> 0) + (b[3]! << 16) + (b[4]! << 8) + b[5]!}:${(b[6]! << 8) | b[7]!}`
  if (key === '80:06') {
    const rate = new DataView(new Uint8Array(b.slice(4)).buffer).getFloat32(0)
    value = rate === 0 ? 'discard' : `${rate * 8 / 1e6} Mbit/s`
  }
  return { input, kind: 'extended', value, meaning: name, detail: b[0]! & 0x40 ? 'non-transitive' : 'transitive', valid: true }
}

/** Decodes one community in any common notation. */
export function decodeOne(raw: string): Decoded {
  const input = raw.trim()
  const s = input.toLowerCase().replace(/^community:?/, '')
  if (s in NAMES) {
    const lo = NAMES[s]!
    return lo < 0 ? { input, kind: 'standard', value: 'internet', meaning: 'internet (match any)', detail: 'Cisco keyword, matches every route', valid: true } : standard(input, 65535, lo)
  }
  let m = /^(\d{1,5}):(\d{1,5})$/.exec(s)
  if (m && Number(m[1]) < 65536 && Number(m[2]) < 65536)
    return standard(input, Number(m[1]), Number(m[2]))
  m = /^(\d{1,10})$/.exec(s)
  if (m && Number(m[1]) < 2 ** 32)
    return standard(input, Math.floor(Number(m[1]) / 65536), Number(m[1]) % 65536)
  m = /^(?:large:)?(\d{1,10}):(\d{1,10}):(\d{1,10})$/.exec(s)
  if (m && [m[1], m[2], m[3]].every(x => Number(x) < 2 ** 32)) {
    const [g, a, b] = [Number(m[1]), Number(m[2]), Number(m[3])]
    const rs: Record<number, string> = { 0: 'route server: do not announce to', 1: 'route server: announce to', 101: 'route server: prepend once to', 102: 'route server: prepend twice to', 103: 'route server: prepend three times to', 666: 'blackhole (by convention)' }
    return { input, kind: 'large', value: `${g}:${a}:${b}`, meaning: rs[a] ? `${rs[a]}${a === 666 ? '' : ` AS${b}`}` : `${asnClass(g, 32)}, function ${a}, parameter ${b}`, detail: rs[a] ? `RFC 8195 / Euro-IX route-server convention, if AS${g} is a route server that uses it` : 'RFC 8092 large community: global administrator (ASN) : local data 1 : local data 2', valid: true }
  }
  m = /^(rt|target|soo|origin):(.+):(\d+)$/.exec(s)
  if (m) {
    const kind = m[1] === 'rt' || m[1] === 'target' ? 'route target' : 'site of origin'
    const admin = m[2]!
    const fmt = /^\d+\.\d+\.\d+\.\d+$/.test(admin) ? 'IPv4' : Number(admin) > 65535 ? '4-byte AS' : '2-byte AS'
    return { input, kind: 'extended', value: `${admin}:${m[3]}`, meaning: `${kind} (${fmt})`, detail: 'extended community (RFC 4360), used by L3VPN / EVPN', valid: true }
  }
  m = /^(?:0x)?([\da-f]{16})$/.exec(s.replace(/[\s:]/g, ''))
  if (m)
    return fromHex(input, m[1]!)
  return { input, kind: 'standard', value: input, meaning: 'not a community', detail: '', valid: false }
}

/** Accepts a pasted "show ip bgp" / "show route detail" line or a list separated by spaces, commas or newlines. */
export function decodeAll(text: string): Decoded[] {
  return text.replace(/(?:Large )?Community:|Communities:|Extended Community:/gi, ' ').split(/[\s,]+/).filter(Boolean).slice(0, 500).map(decodeOne)
}
