import type { QueryScope } from './queryScope'
import { ref } from 'vue'
import { scopedLocation } from './queryScope'

export interface Entry { search: string, at: number, pinned: boolean }
export const MAX_ENTRIES = 10
const KEY = 'nettools:history'

type Store = Record<string, Entry[]>

function load(): Store {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Store
  }
  catch {
    return {}
  }
}
function save(s: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  }
  catch {} // private mode or full storage: history is a convenience only
}

/** Reactive view of the stored history; bumped on every change. */
export const historyVersion = ref(0)

/** Parameters that only steer the view, not the input. */
const IGNORE = new Set(['embed', 'tab', 'format', 'output'])

export function normalize(search: string): string {
  const p = new URLSearchParams(search)
  for (const k of [...p.keys()]) {
    if (IGNORE.has(k) || !p.get(k))
      p.delete(k)
  }
  p.sort()
  return p.toString()
}

/** Adds an entry for a tool path; pinned entries stay, the rest keeps the newest MAX_ENTRIES. */
export function addHistory(path: string, search: string, now = Date.now()) {
  const q = normalize(search)
  if (!q)
    return
  const s = load()
  const list = (s[path] ?? []).filter(e => e.search !== q)
  const old = (s[path] ?? []).find(e => e.search === q)
  list.unshift({ search: q, at: now, pinned: old?.pinned ?? false })
  const pinned = list.filter(e => e.pinned)
  const rest = list.filter(e => !e.pinned).slice(0, Math.max(0, MAX_ENTRIES - pinned.length))
  s[path] = [...pinned, ...rest].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.at - a.at)
  save(s)
  historyVersion.value++
}

/** Records the current page (called when a server tool runs); compare sides record their own tool. */
export function recordCurrent(scope?: QueryScope) {
  if (typeof window !== 'undefined' && window.location) {
    const { path, search } = scopedLocation(scope)
    addHistory(path, search)
  }
}

export function getHistory(path: string): Entry[] {
  return load()[path] ?? []
}

export function togglePin(path: string, search: string) {
  const s = load()
  const e = s[path]?.find(x => x.search === search)
  if (e) {
    e.pinned = !e.pinned
    save(s)
    historyVersion.value++
  }
}

export function clearHistory(path: string) {
  const s = load()
  s[path] = (s[path] ?? []).filter(e => e.pinned)
  save(s)
  historyVersion.value++
}

/** Short label from the parameter values: "example.com · MX". */
export function label(search: string): string {
  const v = [...new URLSearchParams(search).values()].map(x => x.replace(/\s+/g, ' ')).join(' · ')
  return v.length > 48 ? `${v.slice(0, 47)}…` : v
}
