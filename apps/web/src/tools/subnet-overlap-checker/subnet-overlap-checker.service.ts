import type { Cidr } from '@/utils/ip'
import { cidrLast, cidrToString, parseCidr } from '@/utils/ip'

export const MAX_PREFIXES = 10_000

export interface Entry { line: number, label: string, cidr: Cidr, text: string }
export interface Overlap { a: Entry, b: Entry, relation: 'identical' | 'contains' }

/**
 * Lines "prefix [label]" or "label: prefix"; a line "# Site A" (or "[Site A]") sets the label for
 * the lines below it. Returns parsed entries and the line numbers that could not be read.
 */
export function parseEntries(input: string): { entries: Entry[], invalid: number[] } {
  const entries: Entry[] = []
  const invalid: number[] = []
  let group = ''
  input.split('\n').forEach((raw, i) => {
    const line = raw.trim()
    if (!line)
      return
    if (line.startsWith('#') || (line.startsWith('[') && line.endsWith(']'))) {
      group = line.replace(/^#|^\[|\]$/g, '').trim()
      return
    }
    // "label: prefix" or "prefix label"
    const colon = line.indexOf(': ')
    const [before, after] = colon > 0 ? [line.slice(0, colon), line.slice(colon + 2).trim()] : ['', line]
    const [prefix = '', ...rest] = after.split(/\s+/)
    const cidr = parseCidr(prefix, { allowBare: true })
    if (!cidr || entries.length >= MAX_PREFIXES) {
      invalid.push(i + 1)
      return
    }
    entries.push({ line: i + 1, label: (before || rest.join(' ')).trim() || group, cidr, text: cidrToString(cidr) })
  })
  return { entries, invalid }
}

/** Prefixes either nest or are disjoint: after sorting by start, an overlap means containment. */
export function findOverlaps(entries: Entry[], sameLabel = false): Overlap[] {
  const out: Overlap[] = []
  for (const v of [4, 6] as const) {
    const list = entries.filter(e => e.cidr.version === v).sort((x, y) => (x.cidr.network < y.cidr.network ? -1 : x.cidr.network > y.cidr.network ? 1 : x.cidr.prefix - y.cidr.prefix))
    for (let i = 0; i < list.length; i++) {
      const a = list[i]!
      const end = cidrLast(a.cidr)
      for (let j = i + 1; j < list.length && list[j]!.cidr.network <= end; j++) {
        const b = list[j]!
        if (!sameLabel && a.label && a.label === b.label)
          continue
        out.push({ a, b, relation: a.cidr.prefix === b.cidr.prefix ? 'identical' : 'contains' })
      }
    }
  }
  return out
}
