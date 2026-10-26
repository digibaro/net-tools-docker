import { gunzipSync } from 'fflate'

export const MAX_FILE_BYTES = 10 * 1024 * 1024

export interface Failure { resultType: string, sendingMtaIp: string, receivingMx: string, receivingIp: string, count: number, info: string }
export interface Policy { type: string, domain: string, mxHosts: string[], policyString: string[], success: number, failure: number, failures: Failure[] }
export interface TlsReport { file: string, organization: string, reportId: string, contact: string, start: string, end: string, policies: Policy[] }

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const num = (v: unknown) => (typeof v === 'number' ? v : 0)
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? v as Record<string, unknown> : {})

/** Parses an RFC 8460 report (JSON, optionally gzip-compressed). */
export function parseReport(bytes: Uint8Array, file: string): TlsReport {
  const raw = bytes[0] === 0x1F && bytes[1] === 0x8B ? gunzipSync(bytes) : bytes
  const j = obj(JSON.parse(new TextDecoder().decode(raw)))
  const range = obj(j['date-range'])
  return {
    file,
    organization: str(j['organization-name']),
    reportId: str(j['report-id']),
    contact: str(j['contact-info']),
    start: str(range['start-datetime']),
    end: str(range['end-datetime']),
    policies: arr(j.policies).map((p) => {
      const pol = obj(obj(p).policy)
      const sum = obj(obj(p).summary)
      return {
        type: str(pol['policy-type']),
        domain: str(pol['policy-domain']),
        mxHosts: arr(pol['mx-host']).map(str),
        policyString: arr(pol['policy-string']).map(str),
        success: num(sum['total-successful-session-count']),
        failure: num(sum['total-failure-session-count']),
        failures: arr(obj(p)['failure-details']).map((f) => {
          const o = obj(f)
          return { resultType: str(o['result-type']), sendingMtaIp: str(o['sending-mta-ip']), receivingMx: str(o['receiving-mx-hostname']), receivingIp: str(o['receiving-ip']), count: num(o['failed-session-count']), info: str(o['additional-information']) || str(o['failure-reason-code']) }
        }),
      }
    }),
  }
}

/** Totals over all reports, and failures grouped by result type and MX. */
export function summarize(reports: TlsReport[]) {
  let success = 0
  let failure = 0
  const groups = new Map<string, { resultType: string, receivingMx: string, count: number, reporters: Set<string> }>()
  for (const r of reports) {
    for (const p of r.policies) {
      success += p.success
      failure += p.failure
      for (const f of p.failures) {
        const key = `${f.resultType}|${f.receivingMx}`
        const g = groups.get(key) ?? { resultType: f.resultType, receivingMx: f.receivingMx, count: 0, reporters: new Set<string>() }
        g.count += f.count
        g.reporters.add(r.organization)
        groups.set(key, g)
      }
    }
  }
  return { success, failure, rate: success + failure ? success / (success + failure) * 100 : 100, failures: [...groups.values()].map(g => ({ ...g, reporters: [...g.reporters].join(', ') })).sort((a, b) => b.count - a.count) }
}
