import type { DaneResult } from '../dane-checker/dane-checker.service'
import type { SmtpBannerResult } from '../smtp-banner-check/smtp-banner-check.service'
import type { components } from '@/api/schema'
import type { Check } from '@/components/health-report'
import { overall } from '../dane-checker/dane-checker.service'

type S = components['schemas']
export interface MailInputs { spf?: S['EmailSpf'], dmarc?: S['EmailDmarc'], mtasts?: S['EmailMtaSts'], mx?: S['EmailMx'], dkim?: S['EmailDkim'], dane?: DaneResult, banner?: SmtpBannerResult, selector: string }

export function deliverability(i: MailInputs): Check[] {
  const c: Check[] = []
  const skip = (id: string) => c.push({ id, status: 'skipped', detail: '' })
  // MX and transport security
  if (i.mx) {
    if (i.mx.nullMx) {
      c.push({ id: 'mx', status: 'info', detail: 'null MX (RFC 7505): the domain accepts no mail' })
    }
    else {
      c.push({ id: 'mx', status: i.mx.hosts.length ? 'pass' : 'fail', detail: i.mx.hosts.map(h => `${h.preference} ${h.host}`).join(', ') })
      const probes = i.mx.hosts.flatMap(h => h.probes)
      const connected = probes.filter(p => p.connected)
      if (!connected.length)
        c.push({ id: 'starttls', status: 'skipped', detail: 'port 25 not reachable from this server' })
      else
        c.push({ id: 'starttls', status: connected.every(p => p.starttls) ? 'pass' : 'fail', detail: connected.filter(p => !p.starttls).map(p => p.address).join(', ') })
      const tls = connected.filter(p => p.tls)
      if (tls.length)
        c.push({ id: 'mxCert', status: tls.every(p => p.tls!.verified) ? 'pass' : 'warn', detail: tls.filter(p => !p.tls!.verified).map(p => `${p.address}: ${p.tls!.verifyError}`).join('; ') })
    }
  }
  else {
    skip('mx')
  }
  // SPF
  const spf = i.spf
  if (!spf) {
    skip('spf')
  }
  else if (!spf.record.record) {
    c.push({ id: 'spf', status: 'fail', detail: 'no SPF record' })
  }
  else {
    c.push({ id: 'spf', status: spf.problems.length ? 'fail' : 'pass', detail: spf.problems.join('; ') || spf.record.record })
    c.push({ id: 'spfAll', status: spf.all === '-all' || spf.all === '~all' ? 'pass' : spf.all === '+all' ? 'fail' : 'warn', detail: spf.all || '(none)' })
    c.push({ id: 'spfLookups', status: spf.lookups > 10 ? 'fail' : spf.lookups > 8 ? 'warn' : 'pass', detail: `${spf.lookups} / 10`, params: { n: spf.lookups } })
  }
  // DMARC
  const d = i.dmarc
  if (!d) {
    skip('dmarc')
  }
  else if (!d.record) {
    c.push({ id: 'dmarc', status: 'fail', detail: 'no DMARC record' })
  }
  else {
    c.push({ id: 'dmarc', status: d.problems.length ? 'fail' : 'pass', detail: d.problems.join('; ') || d.record })
    c.push({ id: 'dmarcPolicy', status: d.policy === 'reject' || d.policy === 'quarantine' ? (d.pct < 100 ? 'warn' : 'pass') : 'warn', detail: `p=${d.policy}${d.pct < 100 ? ` pct=${d.pct}` : ''}` })
    c.push({ id: 'dmarcRua', status: d.rua.length ? 'pass' : 'warn', detail: d.rua.map(r => r.uri).join(', ') })
  }
  // DKIM (needs a selector)
  if (!i.selector)
    c.push({ id: 'dkim', status: 'skipped', detail: 'enter a selector to check DKIM' })
  else if (i.dkim)
    c.push({ id: 'dkim', status: i.dkim.record && !i.dkim.problems.length && !i.dkim.revoked ? (i.dkim.keyType === 'rsa' && i.dkim.keyBits < 2048 ? 'warn' : 'pass') : 'fail', detail: i.dkim.record ? `${i.dkim.keyType} ${i.dkim.keyBits} bit${i.dkim.problems.length ? `; ${i.dkim.problems.join('; ')}` : ''}` : `no record at ${i.dkim.name}` })
  else
    c.push({ id: 'dkim', status: 'fail', detail: 'lookup failed' })
  // MTA-STS, TLS-RPT, BIMI
  const m = i.mtasts
  if (m) {
    c.push({ id: 'mtaSts', status: m.mtaSts.mode === 'enforce' ? 'pass' : m.mtaSts.mode === 'testing' ? 'warn' : m.mtaSts.record ? 'warn' : 'info', detail: m.mtaSts.problems.join('; ') || (m.mtaSts.mode ? `mode ${m.mtaSts.mode}` : 'no MTA-STS policy') })
    c.push({ id: 'tlsRpt', status: m.tlsRpt.record ? 'pass' : 'info', detail: m.tlsRpt.rua.join(', ') })
    c.push({ id: 'bimi', status: m.bimi.record ? 'pass' : 'info', detail: m.bimi.logo })
  }
  else {
    skip('mtaSts')
  }
  // DANE
  if (i.dane) {
    const v = overall(i.dane)
    c.push({ id: 'dane', status: v === 'valid' ? 'pass' : v === 'mismatch' ? 'fail' : v === 'insecure' ? 'warn' : 'info', detail: v })
  }
  // Reverse DNS of the primary MX
  if (i.banner)
    c.push({ id: 'fcrdns', status: i.banner.fcrdns ? 'pass' : 'fail', detail: `${i.banner.address} → ${i.banner.ptr.join(', ') || 'no PTR'}`, params: { host: i.banner.host } })
  return c
}
