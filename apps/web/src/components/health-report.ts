export type Status = 'pass' | 'info' | 'warn' | 'fail' | 'skipped'
export interface Check { id: string, status: Status, detail: string, params?: Record<string, string | number> }

/** 100 minus 25 per failure and 8 per warning; letters at 90 / 80 / 65 / 50. */
export function grade(checks: Check[]): { score: number, letter: 'A' | 'B' | 'C' | 'D' | 'F' } {
  const fail = checks.filter(c => c.status === 'fail').length
  const warn = checks.filter(c => c.status === 'warn').length
  const score = Math.max(0, 100 - 25 * fail - 8 * warn)
  const letter = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 65 ? 'C' : score >= 50 ? 'D' : 'F'
  return { score, letter }
}

const ORDER: Record<Status, number> = { fail: 0, warn: 1, info: 2, skipped: 3, pass: 4 }
export const sortChecks = (c: Check[]) => [...c].sort((a, b) => ORDER[a.status] - ORDER[b.status])
