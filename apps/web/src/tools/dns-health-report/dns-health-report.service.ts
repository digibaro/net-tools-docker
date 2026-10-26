import type { DnsLookup } from '../dns-lookup/dns-lookup.service'
import type { components } from '@/api/schema'
import type { Check } from '@/components/health-report'
import { grade as ednsGrade } from '../edns-compliance/edns-compliance.service'

export type DnsConsistency = components['schemas']['DnsConsistency']
export type DnssecResult = components['schemas']['DnssecResult']
export type EdnsCompResult = components['schemas']['EdnsCompResult']

export interface Inputs { consistency?: DnsConsistency, dnssec?: DnssecResult, soa?: DnsLookup, caa?: DnsLookup, mx?: DnsLookup, edns?: EdnsCompResult }

/** RFC 1912 §2.2 / RIPE-203 recommended SOA timer ranges (seconds). */
export function soaChecks(data: string): Check[] {
  const f = data.trim().split(/\s+/)
  if (f.length < 7)
    return []
  const [refresh, retry, expire, minimum] = f.slice(3, 7).map(Number) as [number, number, number, number]
  const out: Check[] = []
  const add = (id: string, ok: boolean, value: number) => out.push({ id, status: ok ? 'pass' : 'warn', detail: `${value} s` })
  add('soaRefresh', refresh >= 1200 && refresh <= 86400, refresh)
  add('soaRetry', retry >= 120 && retry < refresh, retry)
  add('soaExpire', expire >= 604800 && expire <= 2419200, expire)
  add('soaMinimum', minimum >= 300 && minimum <= 86400, minimum)
  return out
}

export function dnsHealth(i: Inputs): Check[] {
  const c: Check[] = []
  const skip = (id: string) => c.push({ id, status: 'skipped', detail: '' })
  const cons = i.consistency
  if (cons) {
    c.push({ id: 'nsCount', status: cons.nameservers.length >= 2 ? 'pass' : 'fail', detail: cons.nameservers.join(', ') })
    const nets = new Set(cons.servers.filter(s => /^\d+\./.test(s.address)).map(s => s.address.split('.').slice(0, 3).join('.')))
    c.push({ id: 'nsDiversity', status: nets.size >= 2 ? 'pass' : 'warn', detail: [...nets].map(n => `${n}.0/24`).join(', ') })
    const broken = cons.servers.filter(s => s.error)
    c.push({ id: 'nsResponding', status: broken.length ? 'fail' : 'pass', detail: broken.map(s => `${s.name}: ${s.error}`).join('; ') })
    c.push({ id: 'authoritative', status: cons.allAuthoritative ? 'pass' : 'fail', detail: cons.servers.filter(s => !s.authoritative && !s.error).map(s => s.name).join(', ') })
    c.push({ id: 'serials', status: cons.serialsConsistent ? 'pass' : 'warn', detail: [...new Set(cons.servers.map(s => s.serial).filter(s => s !== null))].join(' / ') })
    c.push({ id: 'nsSets', status: cons.nsSetsConsistent ? 'pass' : 'warn', detail: '' })
    const slow = cons.servers.filter(s => s.rttMs > 500)
    c.push({ id: 'rtt', status: slow.length ? 'warn' : 'pass', detail: cons.servers.map(s => `${s.name} ${Math.round(s.rttMs)} ms`).join(', ') })
  }
  else {
    ['nsCount', 'nsResponding', 'serials'].forEach(skip)
  }
  const soa = i.soa?.answer.find(r => r.type === 'SOA')
  if (soa)
    c.push(...soaChecks(soa.data))
  else
    c.push({ id: 'soa', status: i.soa ? 'fail' : 'skipped', detail: i.soa?.rcode ?? '' })
  const ds = i.dnssec
  if (ds)
    c.push({ id: 'dnssec', status: ds.status === 'secure' ? 'pass' : ds.status === 'bogus' ? 'fail' : ds.status === 'insecure' ? 'info' : 'warn', detail: ds.message })
  else
    skip('dnssec')
  if (i.edns) {
    const grades = i.edns.servers.map(s => ednsGrade(s))
    c.push({ id: 'edns', status: grades.includes('broken') ? 'fail' : grades.includes('minor') ? 'warn' : grades.every(g => g === 'unreachable') ? 'warn' : 'pass', detail: i.edns.servers.map((s, n) => `${s.name}: ${grades[n]}`).join(', ') })
  }
  else {
    skip('edns')
  }
  if (i.caa)
    c.push({ id: 'caa', status: i.caa.answer.some(r => r.type === 'CAA') ? 'pass' : 'info', detail: i.caa.answer.filter(r => r.type === 'CAA').map(r => r.data).join(', ') })
  if (i.mx)
    c.push({ id: 'mx', status: 'info', detail: i.mx.answer.filter(r => r.type === 'MX').map(r => r.data).join(', ') || '—' })
  return c
}
