import type { WebInputs } from './domain-scorecard.service'
import { describe, expect, it } from 'vitest'
import { webChecks } from './domain-scorecard.service'

const hop = (url: string, status: number, error = '') => ({ url, status, error, errorCode: '', method: 'GET', remoteAddr: '', statusText: '', proto: '', headers: [], location: '', contentType: '', bodyPreview: '', bodyBytes: 0, bodyTruncated: false, timing: { resolveMs: 0, connectMs: 0, tlsMs: 0, ttfbMs: 0, transferMs: 0, totalMs: 0 }, tls: null })

const good: WebInputs = {
  ipv6: { domain: 'x.test', serverIpv6: true, hosts: [], score: 100, verdict: 'ready' },
  tls: { version: 'TLS 1.3', cipher: '', alpn: 'h2', serverName: 'x.test', ocspStapled: false, verified: true, verifyError: '', handshakeMs: 10, starttls: '', connectedTo: '192.0.2.1:443', chain: [{ subject: '', issuer: '', serial: '', notBefore: '', notAfter: '2027-01-01T00:00:00Z', daysLeft: 60, dnsNames: [], ipAddresses: [], keyAlgorithm: '', signatureAlgorithm: '', isCA: false, sha256: '', selfSigned: false }] },
  headers: { url: 'https://x.test/', status: 200, grade: 'A', score: 95, hop: hop('https://x.test/', 200), checks: [{ id: 'hsts', header: 'Strict-Transport-Security', status: 'pass', value: 'max-age=31536000', detail: 'ok' }] },
  redirects: { hops: [hop('http://x.test/', 301), hop('https://x.test/', 200)] },
} as WebInputs

const byId = (i: WebInputs) => Object.fromEntries(webChecks(i).map(c => [c.id, c.status]))

describe('webChecks', () => {
  it('passes a well-configured site', () => {
    expect(byId(good)).toEqual({ ipv6: 'pass', https: 'pass', tlsVersion: 'pass', certExpiry: 'pass', httpsRedirect: 'pass', headers: 'pass', hsts: 'pass' })
  })

  it('flags missing HTTPS, legacy TLS, no redirect, weak headers and no IPv6', () => {
    const bad = {
      ...good,
      ipv6: { ...good.ipv6!, verdict: 'not-ready', score: 0 },
      tls: { ...good.tls!, version: 'TLS 1.0', verified: false, verifyError: 'x509: expired', chain: [{ ...good.tls!.chain[0]!, daysLeft: 3 }] },
      headers: { ...good.headers!, grade: 'D' },
      redirects: { hops: [hop('http://x.test/', 200)] },
    } as WebInputs
    expect(byId(bad)).toMatchObject({ ipv6: 'fail', https: 'fail', tlsVersion: 'fail', certExpiry: 'fail', httpsRedirect: 'fail', headers: 'fail' })
  })

  it('treats an unreachable port 443 as a failure and missing data as skipped', () => {
    expect(byId({})).toEqual({ ipv6: 'skipped', https: 'fail', httpsRedirect: 'skipped', headers: 'skipped' })
  })

  it('reports HTTP/2 and HTTP/3', () => {
    const p = { http2: true, httpVersion: 'HTTP/2.0', http3: { ok: false, advertised: false, error: '', quicVersion: '' } } as unknown as WebInputs['protocols']
    expect(byId({ ...good, protocols: p })).toMatchObject({ http2: 'pass', http3: 'info' })
  })
})
