import type { HttpProtocols } from '../http-protocols/http-protocols.service'
import type { Ipv6Readiness } from '../ipv6-readiness/ipv6-readiness.service'
import type { HttpHops } from '../redirect-tracer/redirect-tracer.service'
import type { SecurityHeaders } from '../security-headers/security-headers.service'
import type { TlsSession } from '../tls-inspector/tls-inspector.service'
import type { Check } from '@/components/health-report'
import { summarize } from '../redirect-tracer/redirect-tracer.service'
import { isLegacyVersion } from '../tls-inspector/tls-inspector.service'

export interface WebInputs {
  ipv6?: Ipv6Readiness
  tls?: TlsSession
  headers?: SecurityHeaders
  protocols?: HttpProtocols
  redirects?: HttpHops
}

/** Website checks in the spirit of internet.nl: IPv6, HTTPS, modern TLS, redirect, headers. */
export function webChecks(i: WebInputs): Check[] {
  const c: Check[] = []
  const skip = (id: string) => c.push({ id, status: 'skipped', detail: '' })

  if (i.ipv6) {
    const v = i.ipv6.verdict
    c.push({ id: 'ipv6', status: v === 'ready' ? 'pass' : v === 'partial' ? 'warn' : 'fail', detail: `${v} (${i.ipv6.score}/100)` })
  }
  else {
    skip('ipv6')
  }

  if (i.tls) {
    c.push({ id: 'https', status: i.tls.verified ? 'pass' : 'fail', detail: i.tls.verified ? i.tls.connectedTo : i.tls.verifyError })
    c.push({ id: 'tlsVersion', status: isLegacyVersion(i.tls.version) ? 'fail' : i.tls.version === 'TLS 1.3' ? 'pass' : 'info', detail: i.tls.version })
    const leaf = i.tls.chain[0]
    if (leaf)
      c.push({ id: 'certExpiry', status: leaf.daysLeft < 14 ? 'fail' : leaf.daysLeft < 30 ? 'warn' : 'pass', detail: `${leaf.daysLeft} d (${leaf.notAfter.slice(0, 10)})`, params: { days: leaf.daysLeft } })
  }
  else {
    c.push({ id: 'https', status: 'fail', detail: 'no TLS connection on port 443' })
  }

  const hops = i.redirects?.hops ?? []
  if (hops.length) {
    const s = summarize(hops)
    const httpsAtEnd = s.finalUrl.startsWith('https://')
    if (hops[0]!.error)
      c.push({ id: 'httpsRedirect', status: 'info', detail: hops[0]!.error })
    else
      c.push({ id: 'httpsRedirect', status: s.httpsUpgrade && httpsAtEnd && !s.downgrade ? 'pass' : 'fail', detail: `${hops[0]!.url} → ${s.finalUrl}` })
  }
  else {
    skip('httpsRedirect')
  }

  if (i.headers) {
    const g = i.headers.grade
    c.push({ id: 'headers', status: g === 'A+' || g === 'A' ? 'pass' : g === 'B' || g === 'C' ? 'warn' : 'fail', detail: `${g} (${i.headers.score}/100)` })
    const hsts = i.headers.checks.find(x => x.id === 'hsts')
    if (hsts)
      c.push({ id: 'hsts', status: hsts.status, detail: hsts.value || hsts.detail })
  }
  else {
    skip('headers')
  }

  if (i.protocols) {
    c.push({ id: 'http2', status: i.protocols.http2 ? 'pass' : 'warn', detail: i.protocols.httpVersion })
    const h3 = i.protocols.http3
    c.push({ id: 'http3', status: h3.ok ? 'pass' : 'info', detail: h3.ok ? h3.quicVersion : h3.advertised ? h3.error : '' })
  }
  return c
}

export type SectionId = 'web' | 'mail' | 'dns'
export interface Section { id: SectionId, prefix: string, checks: Check[] }
