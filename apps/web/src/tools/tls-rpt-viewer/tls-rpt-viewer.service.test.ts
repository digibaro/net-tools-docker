import { gzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { parseReport, summarize } from './tls-rpt-viewer.service'

const REPORT = {
  'organization-name': 'Google Inc.',
  'date-range': { 'start-datetime': '2026-10-20T00:00:00Z', 'end-datetime': '2026-10-20T23:59:59Z' },
  'contact-info': 'smtp-tls-reporting@google.com',
  'report-id': '2026-10-20T00:00:00Z_example.com',
  'policies': [{
    'policy': { 'policy-type': 'sts', 'policy-string': ['version: STSv1', 'mode: enforce'], 'policy-domain': 'example.com', 'mx-host': ['mx.example.com'] },
    'summary': { 'total-successful-session-count': 980, 'total-failure-session-count': 20 },
    'failure-details': [{ 'result-type': 'certificate-expired', 'sending-mta-ip': '209.85.220.41', 'receiving-mx-hostname': 'mx.example.com', 'receiving-ip': '192.0.2.25', 'failed-session-count': 20 }],
  }],
}

describe('tls-rpt-viewer', () => {
  it('parses plain and gzip reports', () => {
    const json = new TextEncoder().encode(JSON.stringify(REPORT))
    for (const bytes of [json, gzipSync(json)]) {
      const r = parseReport(bytes, 'r.json')
      expect(r.organization).toBe('Google Inc.')
      expect(r.policies[0]!.failures[0]!.resultType).toBe('certificate-expired')
    }
  })
  it('summarizes', () => {
    const r = parseReport(new TextEncoder().encode(JSON.stringify(REPORT)), 'r.json')
    const s = summarize([r, r])
    expect(s.success).toBe(1960)
    expect(s.rate).toBe(98)
    expect(s.failures[0]).toMatchObject({ resultType: 'certificate-expired', count: 40, reporters: 'Google Inc.' })
  })
})
