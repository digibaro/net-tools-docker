import type { MailInputs } from './email-deliverability-report.service'
import { describe, expect, it } from 'vitest'
import { deliverability } from './email-deliverability-report.service'

describe('email-deliverability-report', () => {
  it('combines SPF, DMARC, MTA-STS and DKIM', () => {
    const i = {
      selector: '',
      spf: { record: { record: 'v=spf1 include:_spf.example -all' }, problems: [], all: '-all', lookups: 9 },
      dmarc: { record: 'v=DMARC1; p=none', problems: [], policy: 'none', pct: 100, rua: [] },
      mtasts: { mtaSts: { mode: 'enforce', problems: [], record: 'v=STSv1' }, tlsRpt: { record: '', rua: [] }, bimi: { record: '', logo: '' } },
    } as unknown as MailInputs
    const s = Object.fromEntries(deliverability(i).map(c => [c.id, c.status]))
    expect(s).toMatchObject({ spf: 'pass', spfAll: 'pass', spfLookups: 'warn', dmarcPolicy: 'warn', dmarcRua: 'warn', dkim: 'skipped', mtaSts: 'pass', tlsRpt: 'info', mx: 'skipped' })
  })
})
