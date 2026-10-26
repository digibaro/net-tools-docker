import { ref } from 'vue'

export interface ReportColumn { key: string, title: string }
export interface ReportItem {
  id: string
  path: string
  search: string
  at: number
  label: string
  columns: ReportColumn[]
  rows: Record<string, string>[]
  truncated: boolean
}

export const MAX_ITEMS = 30
export const MAX_ROWS = 500
const KEY = 'nettools:report'

/** Bumped on every change so computed views re-read storage. */
export const reportVersion = ref(0)

export function getReport(): ReportItem[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as ReportItem[]
  }
  catch {
    return []
  }
}

function save(items: ReportItem[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(items))
    reportVersion.value++
    return true
  }
  catch {
    return false // quota: the caller tells the user
  }
}

/** Snapshot of a result table; values are stringified so the report survives reloads unchanged. */
export function addToReport(x: { path: string, search: string, label: string, columns: ReportColumn[], rows: object[] }, now = Date.now()): boolean {
  const rows = (x.rows as Record<string, unknown>[]).slice(0, MAX_ROWS).map(r => Object.fromEntries(x.columns.map(c => [c.key, String(r[c.key] ?? '')])))
  const item: ReportItem = { id: `${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`, path: x.path, search: x.search.replace(/^\?/, ''), at: now, label: x.label, columns: x.columns.map(c => ({ key: c.key, title: c.title })), rows, truncated: x.rows.length > MAX_ROWS }
  return save([...getReport(), item].slice(-MAX_ITEMS))
}

export function removeFromReport(id: string) {
  save(getReport().filter(i => i.id !== id))
}

export function moveInReport(id: string, by: -1 | 1) {
  const items = getReport()
  const i = items.findIndex(x => x.id === id)
  const j = i + by
  if (i < 0 || j < 0 || j >= items.length)
    return
  const [a, b] = [items[i]!, items[j]!]
  items[i] = b
  items[j] = a
  save(items)
}

export function clearReport() {
  save([])
}

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ')

/** Markdown export: one section per item with a pipe table. */
export function toMarkdown(items: ReportItem[], title: (i: ReportItem) => string, origin: string, heading: string, now = new Date()): string {
  const out = [`# ${heading}`, '', `_${now.toISOString()}_`, '']
  for (const i of items) {
    out.push(`## ${title(i)}${i.label ? ` — ${i.label}` : ''}`, '', `${origin}${i.path}${i.search ? `?${i.search}` : ''} · ${new Date(i.at).toISOString()}`, '')
    out.push(`| ${i.columns.map(c => cell(c.title)).join(' | ')} |`, `|${i.columns.map(() => ' --- |').join('')}`)
    for (const r of i.rows)
      out.push(`| ${i.columns.map(c => cell(r[c.key] ?? '')).join(' | ')} |`)
    if (i.truncated)
      out.push('', `_(first ${MAX_ROWS} rows)_`)
    out.push('')
  }
  return out.join('\n')
}
