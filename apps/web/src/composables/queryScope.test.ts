import { describe, expect, it } from 'vitest'
import { compareQuery, scopedLocation } from './queryScope'

describe('queryScope', () => {
  it('maps a compare side back to the tool URL', () => {
    const loc = { pathname: '/compare', search: '?tool=%2Fdns-lookup&a.name=a.com&b.name=b.com&a.type=MX' }
    expect(scopedLocation({ prefix: 'b.', path: '/dns-lookup' }, loc)).toEqual({ path: '/dns-lookup', search: '?name=b.com' })
    expect(scopedLocation({ prefix: 'a.', path: '/dns-lookup' }, loc).search).toBe('?name=a.com&type=MX')
    expect(scopedLocation(undefined, loc).path).toBe('/compare')
  })
  it('builds the compare query', () => {
    expect(compareQuery('/ping', { target: 'x', n: ['1', '2'] })).toEqual({ 'tool': '/ping', 'a.target': 'x', 'b.target': 'x', 'a.n': '1', 'b.n': '1' })
  })
})
