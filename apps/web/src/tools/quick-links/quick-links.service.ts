import type { components } from '@/api/schema'

export type QuickLinks = components['schemas']['QuickLinks']
export type QuickLink = QuickLinks['links'][number]

export interface LinkGroup { name: string, links: QuickLink[] }

/** Groups in first-seen order; links without a group go to `fallback`. */
export function groupLinks(links: QuickLink[], q: string, fallback: string): LinkGroup[] {
  const needle = q.trim().toLowerCase()
  const groups = new Map<string, QuickLink[]>()
  for (const l of links) {
    if (needle && ![l.name, l.description, l.group, l.url].some(s => s.toLowerCase().includes(needle)))
      continue
    const g = l.group.trim() || fallback
    groups.set(g, [...(groups.get(g) ?? []), l])
  }
  return [...groups].map(([name, links]) => ({ name, links }))
}

/** http(s) only — the list comes from a file, but never render javascript: or data: links. */
export function linkHref(u: string): string | undefined {
  try {
    const p = new URL(u).protocol
    return p === 'https:' || p === 'http:' ? u : undefined
  }
  catch {
    return undefined
  }
}

export function hostOf(u: string) {
  try {
    return new URL(u).host
  }
  catch {
    return u
  }
}
