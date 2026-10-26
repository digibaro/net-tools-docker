export interface Step { id: 'lower' | 'lowered' | 'change' | 'propagated' | 'restore', at: Date }
export interface Plan { steps: Step[], worstCaseMinutes: number }

/**
 * TTL lowering plan: lower the TTL at least one old TTL (plus margin) before the change, so every
 * cache holds the record for at most the low TTL when it changes; restore after verification.
 */
export function plan(change: Date, currentTtl: number, lowTtl: number, marginPct = 25, verifyHours = 24): Plan {
  const ms = (s: number) => s * 1000
  const lower = new Date(change.getTime() - ms(currentTtl * (1 + marginPct / 100)))
  return {
    steps: [
      { id: 'lower', at: lower },
      { id: 'lowered', at: new Date(lower.getTime() + ms(currentTtl)) },
      { id: 'change', at: change },
      { id: 'propagated', at: new Date(change.getTime() + ms(lowTtl)) },
      { id: 'restore', at: new Date(change.getTime() + verifyHours * 3600_000) },
    ],
    worstCaseMinutes: Math.ceil(lowTtl / 60),
  }
}

const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

/** iCalendar file with one 15-minute event per step. */
export function toIcs(steps: Step[], titles: Record<Step['id'], string>, name: string): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//NET-TOOLS//DNS TTL planner//EN', 'CALSCALE:GREGORIAN']
  const stamp = icsDate(new Date())
  for (const s of steps) {
    lines.push('BEGIN:VEVENT', `UID:${s.id}-${s.at.getTime()}@nettools`, `DTSTAMP:${stamp}`, `DTSTART:${icsDate(s.at)}`, `DTEND:${icsDate(new Date(s.at.getTime() + 900_000))}`, `SUMMARY:${titles[s.id]} (${name})`.replace(/[,;]/g, m => `\\${m}`), 'END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return `${lines.join('\r\n')}\r\n`
}
