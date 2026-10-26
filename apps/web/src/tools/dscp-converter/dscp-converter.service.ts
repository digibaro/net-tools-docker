/** Per-hop behaviours with their DSCP values (RFC 2474, 2597, 3246, 5865, 8622) and RFC 4594 usage. */
export const PHBS: { name: string, dscp: number, use: string }[] = [
  { name: 'CS0 / DF', dscp: 0, use: 'best-effort' },
  { name: 'LE', dscp: 1, use: 'lower-effort' },
  { name: 'CS1', dscp: 8, use: 'scavenger' },
  { name: 'AF11', dscp: 10, use: 'high-throughput' },
  { name: 'AF12', dscp: 12, use: 'high-throughput' },
  { name: 'AF13', dscp: 14, use: 'high-throughput' },
  { name: 'CS2', dscp: 16, use: 'oam' },
  { name: 'AF21', dscp: 18, use: 'low-latency-data' },
  { name: 'AF22', dscp: 20, use: 'low-latency-data' },
  { name: 'AF23', dscp: 22, use: 'low-latency-data' },
  { name: 'CS3', dscp: 24, use: 'broadcast-video' },
  { name: 'AF31', dscp: 26, use: 'multimedia-streaming' },
  { name: 'AF32', dscp: 28, use: 'multimedia-streaming' },
  { name: 'AF33', dscp: 30, use: 'multimedia-streaming' },
  { name: 'CS4', dscp: 32, use: 'real-time-interactive' },
  { name: 'AF41', dscp: 34, use: 'multimedia-conferencing' },
  { name: 'AF42', dscp: 36, use: 'multimedia-conferencing' },
  { name: 'AF43', dscp: 38, use: 'multimedia-conferencing' },
  { name: 'CS5', dscp: 40, use: 'signaling' },
  { name: 'VOICE-ADMIT', dscp: 44, use: 'telephony' },
  { name: 'EF', dscp: 46, use: 'telephony' },
  { name: 'CS6', dscp: 48, use: 'network-control' },
  { name: 'CS7', dscp: 56, use: 'reserved' },
]

export interface Dscp { dscp: number, name: string, binary: string, tos: number, tosHex: string, precedence: number, cos: number, drop?: string, use: string }

/** RFC 8325-style 802.1p mapping: voice 6, video 5/4, signaling 3, control 7 → common practice uses precedence, EF → 5. */
const cosOf = (d: number) => (d === 46 || d === 44 ? 5 : d >> 3)

export function describe(dscp: number): Dscp {
  const phb = PHBS.find(p => p.dscp === dscp)
  const name = phb?.name ?? `DSCP ${dscp}`
  const tos = dscp << 2
  const af = /^AF\d(\d)$/.exec(name)
  return { dscp, name, binary: dscp.toString(2).padStart(6, '0'), tos, tosHex: `0x${tos.toString(16).padStart(2, '0')}`, precedence: dscp >> 3, cos: cosOf(dscp), drop: af ? ['low', 'medium', 'high'][Number(af[1]) - 1] : undefined, use: phb?.use ?? 'unassigned' }
}

/** Accepts "EF", "af41", "46", "dscp 46", "0xb8" (ToS byte), "tos 184", "101110" (binary DSCP), "prec 5". */
export function parse(input: string): number | undefined {
  const s = input.trim().toLowerCase().replace(/\s+/g, ' ')
  const phb = PHBS.find(p => p.name.toLowerCase().split(' / ').includes(s))
  if (phb)
    return phb.dscp
  const hex = /^(?:tos )?0x([\da-f]{1,2})$/.exec(s)
  if (hex)
    return Number.parseInt(hex[1]!, 16) >> 2
  const tos = /^tos (\d{1,3})$/.exec(s)
  if (tos && Number(tos[1]) < 256)
    return Number(tos[1]) >> 2
  const prec = /^(?:prec(?:edence)? |ipp )([0-7])$/.exec(s)
  if (prec)
    return Number(prec[1]) << 3
  if (/^[01]{6}$/.test(s))
    return Number.parseInt(s, 2)
  const dec = /^(?:dscp )?(\d{1,2})$/.exec(s)
  if (dec && Number(dec[1]) < 64)
    return Number(dec[1])
  return undefined
}

export function snippets(d: Dscp): { platform: string, config: string }[] {
  const n = d.name.split(' / ')[0]!.toLowerCase()
  return [
    { platform: 'Cisco IOS / IOS-XE (MQC)', config: `class-map match-any ${n.toUpperCase()}\n match dscp ${n.startsWith('dscp') || n === 'voice-admit' ? d.dscp : n}\npolicy-map MARK\n class ${n.toUpperCase()}\n  set dscp ${n.startsWith('dscp') || n === 'voice-admit' ? d.dscp : n}` },
    { platform: 'Juniper Junos', config: `set class-of-service code-point-aliases dscp ${n} ${d.binary}` },
    { platform: 'Linux iptables', config: `iptables -t mangle -A POSTROUTING -p udp --dport 5060 -j DSCP --set-dscp ${d.dscp}` },
    { platform: 'Linux nftables', config: `nft add rule inet mangle postrouting udp dport 5060 ip dscp set ${d.dscp}` },
    { platform: 'MikroTik', config: `/ip firewall mangle add chain=postrouting protocol=udp dst-port=5060 action=change-dscp new-dscp=${d.dscp}` },
  ]
}
