import { describe, expect, it } from 'vitest'
import { plan, toIcs } from './dns-ttl-planner.service'

describe('dns-ttl-planner', () => {
  it('plans the TTL steps', () => {
    const change = new Date('2026-11-01T20:00:00Z')
    const p = plan(change, 86400, 300)
    expect(p.steps[0]!.at.toISOString()).toBe('2026-10-31T14:00:00.000Z') // 30 h before (24 h + 25 %)
    expect(p.steps[3]!.at.toISOString()).toBe('2026-11-01T20:05:00.000Z')
    expect(p.worstCaseMinutes).toBe(5)
  })
  it('writes iCalendar', () => {
    const p = plan(new Date('2026-11-01T20:00:00Z'), 3600, 60)
    const ics = toIcs(p.steps, { lower: 'Lower TTL', lowered: 'Low', change: 'Change', propagated: 'Done', restore: 'Restore' }, 'www.example.com')
    expect(ics).toContain('DTSTART:20261101T200000Z')
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(5)
  })
})
