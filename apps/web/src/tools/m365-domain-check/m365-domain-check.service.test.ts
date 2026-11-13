import type { M365Result } from './m365-domain-check.service'
import { describe, expect, it } from 'vitest'
import { m365Checks, recordRows } from './m365-domain-check.service'

function base(over: Partial<M365Result> = {}): M365Result {
  return {
    domain: 'contoso.test',
    usesExchange: true,
    tenant: { found: true, id: 'guid', region: 'EU', cloud: 'microsoftonline.com', namespace: 'Managed', brand: 'Contoso', federationHost: '', error: '' },
    checks: [
      { id: 'mx', name: 'contoso.test', type: 'MX', expected: 'x', found: ['contoso-test.mail.protection.outlook.com'], status: 'pass' },
      { id: 'autodiscover', name: 'autodiscover.contoso.test', type: 'CNAME', expected: 'autodiscover.outlook.com', found: [], status: 'warn' },
      { id: 'dmarc', name: '_dmarc.contoso.test', type: 'TXT', expected: 'v=DMARC1', found: [], status: 'warn' },
    ],
    ...over,
  }
}

describe('m365Checks', () => {
  it('keeps statuses for a tenant using Exchange Online', () => {
    const c = m365Checks(base())
    expect(c[0]).toEqual({ id: 'tenant', status: 'pass', detail: 'guid' })
    expect(c.find(x => x.id === 'autodiscover')?.status).toBe('warn')
  })

  it('downgrades Exchange records when mail goes elsewhere, but not DMARC', () => {
    const c = m365Checks(base({ usesExchange: false }))
    expect(c.find(x => x.id === 'autodiscover')?.status).toBe('info')
    expect(c.find(x => x.id === 'dmarc')?.status).toBe('warn')
  })

  it('makes everything informational for a domain without Microsoft 365', () => {
    const c = m365Checks(base({ usesExchange: false, tenant: { ...base().tenant, found: false, id: '' } }))
    expect(c.every(x => x.status === 'info' || x.status === 'pass')).toBe(true)
  })

  it('builds record rows', () => {
    expect(recordRows(base())[1]).toEqual({ id: 'autodiscover', name: 'autodiscover.contoso.test', type: 'CNAME', expected: 'autodiscover.outlook.com', found: '—' })
  })
})
