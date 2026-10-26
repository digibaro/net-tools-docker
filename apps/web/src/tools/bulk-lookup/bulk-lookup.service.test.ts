import type { Get, Row } from './bulk-lookup.service'
import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/client'
import { OPS, parseTargets, runBulk } from './bulk-lookup.service'

const op = (id: string) => OPS.find(o => o.id === id)!

describe('bulk-lookup', () => {
  it('parses a target list', () => {
    expect(parseTargets('a.com\nb.com, c.com # comment\n\na.com\nd.com.')).toEqual({ targets: ['a.com', 'b.com', 'c.com', 'd.com'], tooMany: false })
    expect(parseTargets(Array.from({ length: 120 }, (_, i) => `h${i}.example`).join('\n'))).toMatchObject({ tooMany: true })
  })

  it('runs, waits on rate limits and reports errors per row', async () => {
    let calls = 0
    const get: Get = async <T>(_p: string, q: Record<string, string>) => {
      calls++
      if (q.name === 'slow.example' && calls < 3)
        throw new ApiError('RATE_LIMITED', 'too many', 429, { retryAfter: 2 })
      if (q.name === 'bad.example')
        throw new ApiError('TARGET_UNRESOLVABLE', 'no such host', 400)
      return { rcode: 'NOERROR', rttMs: 3, answer: [{ name: q.name, type: 'A', ttl: 60, class: 'IN', data: '192.0.2.1' }] } as T
    }
    const rows: Row[] = []
    const waits: number[] = []
    await runBulk(['slow.example', 'bad.example', `${'a'.repeat(64)}.com`], op('dns'), { type: 'A', ports: '' }, { get, concurrency: 1, onRow: (i, r) => (rows[i] = r), onWait: s => waits.push(s), sleep: async () => {} })
    expect(waits).toEqual([2, 2])
    expect(rows.map(r => r.status)).toEqual(['ok', 'error', 'error'])
    expect(rows[0]!.result).toBe('192.0.2.1')
    expect(rows[1]!.detail).toContain('TARGET_UNRESOLVABLE')
    expect(rows[2]!.detail).toBe('invalid')
  })

  it('maps ASN and port results', async () => {
    const asn = await op('asn').run('192.0.2.1', { type: 'A', ports: '' }, (async () => ({ ip: '192.0.2.1', announced: true, origins: [{ asn: 64500, asName: 'EXAMPLE', prefix: '192.0.2.0/24', country: 'NL', registry: 'ripencc', allocated: '' }] })) as Get)
    expect(asn.result).toBe('AS64500 EXAMPLE')
    const port = await op('port').run('example.com', { type: 'A', ports: '22,443' }, (async () => ({ target: 'example.com', address: '', rows: [{ port: 22, proto: 'tcp', state: 'filtered', service: 'ssh', rttMs: 0, detail: '' }, { port: 443, proto: 'tcp', state: 'open', service: 'https', rttMs: 5, detail: '' }] })) as Get)
    expect(port).toMatchObject({ status: 'ok', result: '443' })
    expect(op('reverse').valid('example.com')).toBe(false)
  })
})
