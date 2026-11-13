import type { components } from '@/api/schema'
import type { Check } from '@/components/health-report'

export type M365Result = components['schemas']['EmailM365']
export type M365Check = M365Result['checks'][number]

/** Checks that only matter when the domain uses Exchange Online for mail. */
const MAIL_CHECKS = new Set(['spf', 'autodiscover', 'dkim1', 'dkim2', 'dmarc'])

/**
 * Graded checks for HealthReport. Mail records are informational when the domain has neither a
 * tenant nor Exchange Online MX (there is nothing to configure for Microsoft 365 then).
 */
export function m365Checks(r: M365Result): Check[] {
  const onM365 = r.tenant.found || r.usesExchange
  const out: Check[] = r.checks.map((c) => {
    let status: Check['status'] = c.status
    if (!onM365 && status !== 'pass')
      status = 'info'
    else if (!r.usesExchange && MAIL_CHECKS.has(c.id) && c.id !== 'dmarc' && status === 'warn')
      status = 'info' // mail goes elsewhere (or through a filter): Exchange records are optional
    return { id: c.id, status, detail: c.found.length ? c.found.join(', ') : '' }
  })
  out.unshift({ id: 'tenant', status: r.tenant.found ? 'pass' : 'info', detail: r.tenant.found ? r.tenant.id : '' })
  return out
}

/** Rows for the records table: what Microsoft expects next to what DNS returned. */
export function recordRows(r: M365Result) {
  return r.checks.map(c => ({ id: c.id, name: c.name, type: c.type, expected: c.expected, found: c.found.join('\n') || '—' }))
}
