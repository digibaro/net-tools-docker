import { beforeEach, describe, expect, it } from 'vitest'
import { addToReport, clearReport, getReport, MAX_ITEMS, moveInReport, removeFromReport, toMarkdown } from './report'

const mem = new Map<string, string>()
globalThis.localStorage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: k => void mem.delete(k), clear: () => mem.clear(), key: () => null, length: 0 } as Storage

const cols = [{ key: 'name', title: 'Name' }, { key: 'v', title: 'Value' }]

describe('report', () => {
  beforeEach(() => clearReport())
  it('stores snapshots, reorders and removes', () => {
    addToReport({ path: '/dns-lookup', search: '?name=a.com', label: 'A', columns: cols, rows: [{ name: 'a.com', v: 1 }] }, 1)
    addToReport({ path: '/ping', search: '', label: '', columns: cols, rows: [{ name: 'x|y', v: null }] }, 2)
    expect(getReport().map(i => i.path)).toEqual(['/dns-lookup', '/ping'])
    expect(getReport()[0]!.rows[0]).toEqual({ name: 'a.com', v: '1' })
    moveInReport(getReport()[1]!.id, -1)
    expect(getReport()[0]!.path).toBe('/ping')
    const md = toMarkdown(getReport(), i => i.path, 'https://nt', 'Report', new Date(0))
    expect(md).toContain('| x\\|y |  |')
    expect(md).toContain('https://nt/dns-lookup?name=a.com')
    removeFromReport(getReport()[0]!.id)
    expect(getReport()).toHaveLength(1)
  })
  it('caps the number of items', () => {
    for (let i = 0; i < MAX_ITEMS + 3; i++)
      addToReport({ path: `/t${i}`, search: '', label: '', columns: cols, rows: [] }, i)
    expect(getReport()).toHaveLength(MAX_ITEMS)
    expect(getReport()[0]!.path).toBe('/t3')
  })
})
