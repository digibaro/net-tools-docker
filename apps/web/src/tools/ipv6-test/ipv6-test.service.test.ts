import type { ProbeResult } from './ipv6-test.service'
import { describe, expect, it } from 'vitest'
import { assess, cfTrace, PROBES, runProbe } from './ipv6-test.service'

const ok = (id: ProbeResult['id'], ip: string, ms = 100): ProbeResult => ({ id, ok: true, ip, family: ip.includes(':') ? 6 : 4, ms })
const fail = (id: ProbeResult['id'], ms = 8000): ProbeResult => ({ id, ok: false, ms, error: 'timeout' })

describe('assess', () => {
  it('scores a working dual-stack connection 10/10', () => {
    expect(assess([ok('v4', '192.0.2.1'), ok('v6', '2001:db8::1'), ok('dual', '2001:db8::1'), ok('v4literal', '192.0.2.1')])).toEqual({ verdict: 'ipv6-ok', score: 10, prefersV6: true, slowFallback: false })
  })

  it('recognises IPv4-only', () => {
    expect(assess([ok('v4', '192.0.2.1'), fail('v6'), ok('dual', '192.0.2.1'), ok('v4literal', '192.0.2.1')])).toMatchObject({ verdict: 'ipv4-only', score: 2 })
  })

  it('flags a slow fallback when IPv6 is advertised but broken', () => {
    expect(assess([ok('v4', '192.0.2.1', 80), fail('v6'), ok('dual', '192.0.2.1', 2500), ok('v4literal', '192.0.2.1')])).toMatchObject({ slowFallback: true, score: 0 })
  })

  it('reports a broken dual stack and offline', () => {
    expect(assess([ok('v4', '192.0.2.1'), ok('v6', '2001:db8::1'), fail('dual'), ok('v4literal', '192.0.2.1')]).verdict).toBe('broken')
    expect(assess([fail('v4'), fail('v6'), fail('dual'), fail('v4literal')]).verdict).toBe('offline')
  })

  it('recognises IPv6-only (NAT64 networks still reach the IPv4 name)', () => {
    expect(assess([fail('v4'), ok('v6', '2001:db8::1'), ok('dual', '2001:db8::1'), fail('v4literal')])).toMatchObject({ verdict: 'ipv6-only', score: 10 })
  })
})

describe('probes', () => {
  it('parses Cloudflare trace output', () => {
    expect(cfTrace('fl=1\nh=1.1.1.1\nip=2001:db8::5\nts=1\n')).toBe('2001:db8::5')
  })

  it('runs a probe with an injected fetch', async () => {
    const f = (async () => new Response('{"ip":"198.51.100.7"}')) as typeof fetch
    expect(await runProbe(PROBES[0]!, 1000, f)).toMatchObject({ id: 'v4', ok: true, ip: '198.51.100.7', family: 4 })
    const bad = (async () => new Response('<html>')) as typeof fetch
    expect(await runProbe(PROBES[0]!, 1000, bad)).toMatchObject({ ok: false, error: 'parse' })
    const err = (async () => {
      throw new TypeError('Failed to fetch')
    }) as typeof fetch
    expect(await runProbe(PROBES[1]!, 1000, err)).toMatchObject({ ok: false, error: 'network' })
  })

  it('only uses https endpoints', () => {
    expect(PROBES.every(p => p.url.startsWith('https://'))).toBe(true)
  })
})
