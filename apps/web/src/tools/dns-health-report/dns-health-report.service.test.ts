import type { DnsLookup } from '../dns-lookup/dns-lookup.service'
import type { DnsConsistency, DnssecResult } from './dns-health-report.service'
import { describe, expect, it } from 'vitest'
import { dnsHealth, soaChecks } from './dns-health-report.service'

const server = (name: string, address: string, serial: number) => ({ name, address, serial, mname: '', rname: '', authoritative: true, nsSet: [], rttMs: 20, error: '' })

describe('dns-health-report', () => {
  it('checks SOA timers', () => {
    const c = soaChecks('ns1.example. hostmaster.example. 2026102601 7200 3600 1209600 300')
    expect(c.every(x => x.status === 'pass')).toBe(true)
    expect(soaChecks('a. b. 1 300 600 3600 60').filter(x => x.status === 'warn').map(x => x.id)).toEqual(['soaRefresh', 'soaRetry', 'soaExpire', 'soaMinimum'])
  })
  it('combines the checks', () => {
    const consistency = { zone: 'example.com', nameservers: ['a.ns', 'b.ns'], serialsConsistent: false, nsSetsConsistent: true, allAuthoritative: true, servers: [server('a.ns', '192.0.2.1', 1), server('b.ns', '192.0.2.2', 2)] } as DnsConsistency
    const soa = { rcode: 'NOERROR', answer: [{ type: 'SOA', data: 'a.ns. h.example. 1 7200 3600 1209600 300' }] } as unknown as DnsLookup
    const checks = dnsHealth({ consistency, soa, dnssec: { status: 'bogus', message: 'bad sig' } as DnssecResult })
    const s = Object.fromEntries(checks.map(c => [c.id, c.status]))
    expect(s).toMatchObject({ nsCount: 'pass', nsDiversity: 'warn', serials: 'warn', dnssec: 'fail', soaRefresh: 'pass', edns: 'skipped' })
  })
})
