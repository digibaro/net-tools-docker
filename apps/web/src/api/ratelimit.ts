import { reactive } from 'vue'

export interface Budget { limit: number, remaining: number, at: number }

/** Last rate-limit headers seen per class (X-RateLimit-*), for hints in the UI. */
export const rateBudget = reactive<Record<'light' | 'heavy', Budget | undefined>>({ light: undefined, heavy: undefined })

export function recordRateLimit(headers: Headers, now = Date.now()) {
  const cls = headers.get('X-RateLimit-Class')
  const limit = Number(headers.get('X-RateLimit-Limit'))
  const remaining = Number(headers.get('X-RateLimit-Remaining'))
  if ((cls === 'light' || cls === 'heavy') && Number.isFinite(limit) && Number.isFinite(remaining))
    rateBudget[cls] = { limit, remaining, at: now }
}

/** A low budget worth mentioning: at most 2 left, seen in the last minute. */
export function lowBudget(b: Budget | undefined, now = Date.now()): number | undefined {
  return b && now - b.at < 60_000 && b.remaining <= 2 ? b.remaining : undefined
}
