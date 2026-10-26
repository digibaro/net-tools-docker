import { beforeEach, describe, expect, it } from 'vitest'
import { addHistory, clearHistory, getHistory, label, MAX_ENTRIES, normalize, togglePin } from './history'

const mem = new Map<string, string>()
globalThis.localStorage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: k => void mem.delete(k), clear: () => mem.clear(), key: () => null, length: 0 } as Storage

describe('history', () => {
  beforeEach(() => mem.clear())
  it('normalizes and de-duplicates', () => {
    expect(normalize('?type=MX&name=example.com&tab=x&empty=')).toBe('name=example.com&type=MX')
    addHistory('/dns-lookup', '?name=a.com', 1)
    addHistory('/dns-lookup', '?name=b.com', 2)
    addHistory('/dns-lookup', '?name=a.com', 3)
    expect(getHistory('/dns-lookup').map(e => e.search)).toEqual(['name=a.com', 'name=b.com'])
  })
  it('keeps pinned entries and caps the rest', () => {
    addHistory('/ping', '?target=keep', 0)
    togglePin('/ping', 'target=keep')
    for (let i = 1; i <= 15; i++)
      addHistory('/ping', `?target=h${i}`, i)
    const h = getHistory('/ping')
    expect(h).toHaveLength(MAX_ENTRIES)
    expect(h[0]).toMatchObject({ search: 'target=keep', pinned: true })
    clearHistory('/ping')
    expect(getHistory('/ping')).toHaveLength(1)
    expect(label('name=example.com&type=MX')).toBe('example.com · MX')
  })
})
