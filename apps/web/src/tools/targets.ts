import type { Tool } from './tool'
import { parseAsn } from '@/utils/bgp'
import { isValidHost } from '@/utils/host'
import { parseCidr, parseIP } from '@/utils/ip'
import { parseMac } from '@/utils/mac'

/** What a search string or a tool's input can be (drives quick actions and external links). */
export type TargetKind = 'ip' | 'domain' | 'url' | 'asn' | 'prefix' | 'email' | 'mac'

export interface Target {
  kind: TargetKind
  /** Normalized value for this kind: "AS13335", "1.1.1.0/24", "example.com", the full URL, … */
  value: string
}

const TLD = /\.(?:xn--[a-z\d-]+|[\p{L}-]{2,63})$/iu

/** A hostname with at least one dot and an alphabetic TLD (not an IP, not "localhost"). */
function isDomain(s: string): boolean {
  return s.includes('.') && TLD.test(s.replace(/\.$/, '')) && isValidHost(s) && !parseIP(s)
}

/**
 * Recognizes one target in free text. The order matters: a URL before a domain, an e-mail address
 * before a domain, a prefix before an IP. Returns undefined for anything else (tool names, words).
 */
export function detectTarget(raw: string): Target | undefined {
  const s = raw.trim()
  if (/^as\s?\d+$/i.test(s)) {
    const n = parseAsn(s)
    return n === undefined ? undefined : { kind: 'asn', value: `AS${n}` }
  }
  if (!s || s.length > 2048 || /\s/.test(s))
    return undefined
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s)
      return u.hostname && !u.username && !u.password ? { kind: 'url', value: u.href } : undefined
    }
    catch {
      return undefined
    }
  }
  const email = /^[^@\s]+@([^@\s]+)$/.exec(s)
  if (email)
    return isDomain(email[1]!) ? { kind: 'email', value: s.toLowerCase() } : undefined
  if (s.includes('/')) {
    const c = parseCidr(s, { allowBare: false })
    return c ? { kind: 'prefix', value: s.toLowerCase() } : undefined
  }
  const ip = parseIP(s.replace(/^\[(.*)\]$/, '$1'))
  if (ip)
    return { kind: 'ip', value: s.replace(/^\[(.*)\]$/, '$1').toLowerCase() }
  if (parseMac(s) !== undefined && !/^\d+$/.test(s))
    return { kind: 'mac', value: s }
  if (isDomain(s))
    return { kind: 'domain', value: s.toLowerCase().replace(/\.$/, '') }
  return undefined
}

/** Other kinds a target also counts as: a URL's host, an e-mail address's domain. */
export function derived(t: Target): Target[] {
  const out: Target[] = [t]
  if (t.kind === 'url') {
    const host = new URL(t.value).hostname.replace(/^\[(.*)\]$/, '$1')
    out.push(parseIP(host) ? { kind: 'ip', value: host } : { kind: 'domain', value: host })
  }
  if (t.kind === 'email')
    out.push({ kind: 'domain', value: t.value.split('@')[1]! })
  return out
}

export interface QuickAction {
  tool: Tool
  target: Target
  /** In-app location with the tool's query parameter filled in. */
  to: string
}

/** Tools that take this target (or what it derives to), in registry order, first match per tool. */
export function quickActions(t: Target, tools: Tool[]): QuickAction[] {
  const targets = derived(t)
  const out: QuickAction[] = []
  for (const tool of tools) {
    const hit = targets.find(x => tool.accepts?.[x.kind])
    if (hit)
      out.push({ tool, target: hit, to: `${tool.path}?${new URLSearchParams({ [tool.accepts![hit.kind]!]: hit.value })}` })
  }
  return out
}

/** The target a tool page is showing, read from its query parameters (for external links). */
export function targetFromQuery(tool: Pick<Tool, 'accepts'>, query: Record<string, unknown>): Target | undefined {
  for (const [kind, param] of Object.entries(tool.accepts ?? {}) as [TargetKind, string][]) {
    const v = query[param]
    if (typeof v !== 'string' || !v.trim())
      continue
    const t = detectTarget(v)
    // A URL field may hold a bare host; IP and prefix fields hold either form.
    const ok = t && (t.kind === kind
      || (kind === 'url' && (t.kind === 'domain' || t.kind === 'ip'))
      || (kind === 'ip' && t.kind === 'prefix')
      || (kind === 'prefix' && t.kind === 'ip'))
    if (ok)
      return t
  }
  return undefined
}

export interface ExternalLink {
  id: string
  name: string
  url: string
}

const enc = encodeURIComponent

/** Well-known third-party lookup sites for a target. Opening one sends the target to that site. */
export function externalLinks(t: Target): ExternalLink[] {
  const links: ExternalLink[] = []
  const add = (id: string, name: string, url: string) => links.push({ id, name, url })
  for (const x of derived(t)) {
    const v = x.value
    switch (x.kind) {
      case 'ip':
        add('shodan', 'Shodan', `https://www.shodan.io/host/${enc(v)}`)
        add('virustotal', 'VirusTotal', `https://www.virustotal.com/gui/ip-address/${enc(v)}`)
        add('abuseipdb', 'AbuseIPDB', `https://www.abuseipdb.com/check/${enc(v)}`)
        add('ipinfo', 'IPinfo', `https://ipinfo.io/${enc(v)}`)
        add('censys', 'Censys', `https://search.censys.io/hosts/${enc(v)}`)
        add('greynoise', 'GreyNoise', `https://viz.greynoise.io/ip/${enc(v)}`)
        add('ripestat', 'RIPEstat', `https://stat.ripe.net/${enc(v)}`)
        add('bgptools', 'bgp.tools', `https://bgp.tools/prefix/${enc(v)}`)
        break
      case 'domain':
        add('virustotal', 'VirusTotal', `https://www.virustotal.com/gui/domain/${enc(v)}`)
        add('urlscan', 'urlscan.io', `https://urlscan.io/domain/${enc(v)}`)
        add('crtsh', 'crt.sh', `https://crt.sh/?q=${enc(v)}`)
        add('dnsviz', 'DNSViz', `https://dnsviz.net/d/${enc(v)}/dnssec/`)
        add('internetnl', 'Internet.nl', `https://internet.nl/site/${enc(v)}/`)
        add('mxtoolbox', 'MXToolbox', `https://mxtoolbox.com/SuperTool.aspx?action=${enc(`mx:${v}`)}&run=toolpage`)
        add('ssllabs', 'SSL Labs', `https://www.ssllabs.com/ssltest/analyze.html?d=${enc(v)}&hideResults=on`)
        add('securityheaders', 'Security Headers', `https://securityheaders.com/?q=${enc(v)}&followRedirects=on`)
        add('shodan', 'Shodan', `https://www.shodan.io/search?query=${enc(`hostname:${v}`)}`)
        if (v.endsWith('.nl'))
          add('sidn', 'SIDN', `https://www.sidn.nl/en/whois?q=${enc(v)}`)
        break
      case 'asn': {
        const n = v.slice(2)
        add('bgptools', 'bgp.tools', `https://bgp.tools/as/${n}`)
        add('bgphe', 'Hurricane Electric BGP', `https://bgp.he.net/AS${n}`)
        add('peeringdb', 'PeeringDB', `https://www.peeringdb.com/asn/${n}`)
        add('ripestat', 'RIPEstat', `https://stat.ripe.net/AS${n}`)
        break
      }
      case 'prefix':
        add('bgptools', 'bgp.tools', `https://bgp.tools/prefix/${enc(v)}`)
        add('bgphe', 'Hurricane Electric BGP', `https://bgp.he.net/net/${enc(v)}`)
        add('ripestat', 'RIPEstat', `https://stat.ripe.net/${enc(v)}`)
        break
      case 'url':
        add('urlscan', 'urlscan.io', `https://urlscan.io/search/#${enc(`page.url:"${v}"`)}`)
        break
    }
  }
  // A URL's host adds domain links: keep the first of each site.
  return links.filter((l, i) => links.findIndex(x => x.id === l.id) === i)
}
