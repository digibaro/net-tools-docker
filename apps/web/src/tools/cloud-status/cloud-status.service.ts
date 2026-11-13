import type { components } from '@/api/schema'

export type CloudStatus = components['schemas']['CloudStatus']
export type CloudService = CloudStatus['services'][number]
export type ServiceState = CloudService['state']

/** Problems first, then unknown, then healthy services, then plain links. */
const ORDER: Record<ServiceState, number> = { outage: 0, degraded: 1, maintenance: 2, unknown: 3, operational: 4, link: 5 }

export function sortServices(list: CloudService[]): CloudService[] {
  return list.map((s, i) => ({ s, i })).sort((a, b) => ORDER[a.s.state] - ORDER[b.s.state] || a.i - b.i).map(x => x.s)
}

/** Naive UI tag type per state (theme-aware colors). */
export function stateTag(state: ServiceState): 'success' | 'warning' | 'error' | 'info' | 'default' {
  return ({ operational: 'success', maintenance: 'info', degraded: 'warning', outage: 'error', unknown: 'default', link: 'default' } as const)[state]
}

export interface Summary { total: number, problems: number, unknown: number }

export function summarize(list: CloudService[]): Summary {
  const fed = list.filter(s => s.state !== 'link')
  return {
    total: fed.length,
    problems: fed.filter(s => s.state === 'outage' || s.state === 'degraded' || s.state === 'maintenance').length,
    unknown: fed.filter(s => s.state === 'unknown').length,
  }
}

/** Only absolute https URLs become links (feeds are third-party data). */
export function safeUrl(u: string): string | undefined {
  try {
    return new URL(u).protocol === 'https:' ? u : undefined
  }
  catch {
    return undefined
  }
}

export function filterServices(list: CloudService[], q: string, problemsOnly: boolean): CloudService[] {
  const needle = q.trim().toLowerCase()
  return list.filter(s => (!problemsOnly || ['outage', 'degraded', 'maintenance', 'unknown'].includes(s.state))
    && (!needle || s.name.toLowerCase().includes(needle) || s.incidents.some(i => i.title.toLowerCase().includes(needle))))
}

/** At most `max` names, plus how many were left out. */
export function shortList(names: string[], max = 8): { shown: string, more: number } {
  return { shown: names.slice(0, max).join(', '), more: Math.max(0, names.length - max) }
}
