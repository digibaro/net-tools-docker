export interface Item { path: string, line: string }
export interface Section { path: string, removed: string[], added: string[], reordered: boolean }

/** Lines that change on every save and say nothing about the configuration. */
const NOISE = [/^!/, /^#/, /^Building configuration/i, /^Current configuration/i, /^ntp clock-period/, /^## Last (?:commit|changed)/, /^version \d/, /^end$/, /^exit$/, /^\s*$/]

/** Hides passwords, secrets and keys in shown lines (the comparison still uses the real text). */
export function mask(line: string): string {
  return line
    .replace(/\b(password|secret|key-string|pre-shared-key|community|key|authentication-key|encrypted-password)(\s+(?:\d\s+)?)(\S+)/gi, (_, k: string, sp: string) => `${k}${sp}********`)
    .replace(/"\$\d\$[^"]+"/g, '"********"')
}

function flattenIndented(text: string): Item[] {
  const items: Item[] = []
  const stack: { indent: number, line: string }[] = []
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+$/, '')
    if (NOISE.some(r => r.test(line.trim())))
      continue
    const indent = line.length - line.trimStart().length
    while (stack.length && stack.at(-1)!.indent >= indent)
      stack.pop()
    items.push({ path: stack.map(s => s.line.trim()).join(' › '), line: line.trim() })
    stack.push({ indent, line })
  }
  return items
}

function flattenBraces(text: string): Item[] {
  const items: Item[] = []
  const stack: string[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim().replace(/\s*##.*$/, '')
    if (!line || NOISE.some(r => r.test(line)) || line.startsWith('/*'))
      continue
    if (line.endsWith('{')) {
      stack.push(line.slice(0, -1).trim())
      continue
    }
    if (line === '}') {
      stack.pop()
      continue
    }
    items.push({ path: stack.join(' › '), line: line.replace(/;$/, '') })
  }
  return items
}

function flattenSet(text: string): Item[] {
  return text.split('\n').map(l => l.trim()).filter(l => /^(?:set|delete|deactivate) /.test(l)).map((l) => {
    const words = l.split(/\s+/)
    return { path: words.slice(1, 3).join(' '), line: l }
  })
}

export type Format = 'auto' | 'indented' | 'junos' | 'set'
export function detect(text: string): Exclude<Format, 'auto'> {
  if (/^\s*set /m.test(text) && !/\{\s*$/m.test(text))
    return 'set'
  return /\{\s*$/m.test(text) ? 'junos' : 'indented'
}

export function flatten(text: string, format: Format = 'auto'): Item[] {
  const f = format === 'auto' ? detect(text) : format
  return f === 'set' ? flattenSet(text) : f === 'junos' ? flattenBraces(text) : flattenIndented(text)
}

/** Order-insensitive diff per section; equal sets in a different order are reported as reordered. */
export function diff(before: string, after: string, format: Format = 'auto'): Section[] {
  const a = flatten(before, format)
  const b = flatten(after, format)
  const group = (items: Item[]) => {
    const m = new Map<string, string[]>()
    for (const it of items)
      m.set(it.path, [...(m.get(it.path) ?? []), it.line])
    return m
  }
  const ga = group(a)
  const gb = group(b)
  const out: Section[] = []
  for (const path of [...new Set([...ga.keys(), ...gb.keys()])]) {
    const la = ga.get(path) ?? []
    const lb = gb.get(path) ?? []
    const count = (l: string[]) => l.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>())
    const cb = count(lb)
    const removed = la.filter((x) => {
      const n = cb.get(x) ?? 0
      if (n > 0) {
        cb.set(x, n - 1)
        return false
      }
      return true
    })
    const ca2 = count(la)
    const added = lb.filter((x) => {
      const n = ca2.get(x) ?? 0
      if (n > 0) {
        ca2.set(x, n - 1)
        return false
      }
      return true
    })
    const reordered = !removed.length && !added.length && la.join('\n') !== lb.join('\n')
    if (removed.length || added.length || reordered)
      out.push({ path, removed, added, reordered })
  }
  return out
}
