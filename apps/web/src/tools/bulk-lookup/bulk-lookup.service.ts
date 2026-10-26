import type { components } from '@/api/schema'
import { ApiError } from '@/api/client'
import { isValidHost } from '@/utils/host'
import { parseIP } from '@/utils/ip'
import { isValidQueryName } from '../dns-lookup/dns-lookup.service'

type S = components['schemas']
export const MAX_TARGETS = 100
export const DNS_TYPES = ['A', 'AAAA', 'MX', 'NS', 'TXT', 'CNAME', 'CAA', 'SOA'] as const

export type OpId = 'dns' | 'reverse' | 'asn' | 'port'
export interface Options { type: string, ports: string }
export interface Row { target: string, status: 'ok' | 'empty' | 'error', result: string, detail: string }
export type Get = <T>(path: string, q: Record<string, string>, signal?: AbortSignal) => Promise<T>

export interface Op {
  id: OpId
  capability: string
  valid: (t: string) => boolean
  run: (t: string, o: Options, get: Get, signal?: AbortSignal) => Promise<Omit<Row, 'target'>>
}

const isIp = (s: string) => parseIP(s) !== undefined
/** Catches obvious typos before spending a request; the server validates fully. */
const isName = (s: string) => s.length <= 253 && s.split('.').every(l => l.length >= 1 && l.length <= 63) && isValidQueryName(s)

export const OPS: Op[] = [
  {
    id: 'dns',
    capability: 'dns.lookup',
    valid: isName,
    run: async (t, o, get, signal) => {
      const r = await get<S['DnsLookup']>('/v1/dns/lookup', { name: t, type: o.type, resolver: 'system' }, signal)
      const data = r.answer.filter(a => a.type === o.type).map(a => a.data)
      return { status: data.length ? 'ok' : 'empty', result: data.join(', ') || r.rcode, detail: `${r.rcode} · ${Math.round(r.rttMs)} ms` }
    },
  },
  {
    id: 'reverse',
    capability: 'dns.reverse',
    valid: isIp,
    run: async (t, _o, get, signal) => {
      const r = await get<S['DnsReverse']>('/v1/dns/reverse', { ip: t, resolver: 'system' }, signal)
      return { status: r.names.length ? 'ok' : 'empty', result: r.names.map(n => n.name).join(', ') || r.rcode, detail: r.names.map(n => `FCrDNS ${n.forwardConfirmed ? '✓' : '✗'}`).join(', ') }
    },
  },
  {
    id: 'asn',
    capability: 'bgp.ip2asn',
    valid: isIp,
    run: async (t, _o, get, signal) => {
      const r = await get<S['AsnLookup']>('/v1/asn/lookup', { ip: t }, signal)
      return { status: r.origins.length ? 'ok' : 'empty', result: r.origins.map(o => `AS${o.asn} ${o.asName}`).join(', ') || '—', detail: r.origins.map(o => `${o.prefix} ${o.country} ${o.registry}`).join(', ') }
    },
  },
  {
    id: 'port',
    capability: 'net.portcheck',
    valid: s => isValidHost(s) || isIp(s),
    run: async (t, o, get, signal) => {
      const r = await get<S['PortCheck']>('/v1/port/check', { target: t, ports: o.ports }, signal)
      const open = r.rows.filter(x => x.state === 'open').map(x => x.port)
      return { status: open.length ? 'ok' : 'empty', result: open.length ? open.join(', ') : '—', detail: r.rows.map(x => `${x.port}:${x.state}`).join(' ') }
    },
  },
]

/** One target per line (or comma/space separated); "#" comments, duplicates and blanks are dropped. */
export function parseTargets(text: string): { targets: string[], tooMany: boolean } {
  const seen = new Set<string>()
  for (const line of text.split('\n')) {
    for (const tok of line.replace(/#.*/, '').split(/[\s,;]+/)) {
      const s = tok.trim().replace(/\.$/, '')
      if (s)
        seen.add(s)
    }
  }
  const all = [...seen]
  return { targets: all.slice(0, MAX_TARGETS), tooMany: all.length > MAX_TARGETS }
}

export interface RunOptions {
  get: Get
  concurrency?: number
  signal?: AbortSignal
  onRow: (i: number, row: Row) => void
  onWait?: (seconds: number) => void
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
}

function defaultSleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    const id = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(id)
      resolve()
    }, { once: true })
  })
}

const MAX_WAITS = 5

/** Runs op over targets with a small pool; a rate-limit or busy answer pauses for retryAfter and retries. */
export async function runBulk(targets: string[], op: Op, o: Options, r: RunOptions): Promise<void> {
  const sleep = r.sleep ?? defaultSleep
  let next = 0
  async function one(i: number) {
    const t = targets[i]!
    if (!op.valid(t)) {
      r.onRow(i, { target: t, status: 'error', result: '', detail: 'invalid' })
      return
    }
    for (let attempt = 0; attempt <= MAX_WAITS; attempt++) {
      try {
        r.onRow(i, { target: t, ...(await op.run(t, o, r.get, r.signal)) })
        return
      }
      catch (err) {
        if (r.signal?.aborted)
          return
        const e = err instanceof ApiError ? err : undefined
        if ((e?.code === 'RATE_LIMITED' || e?.code === 'BUSY') && attempt < MAX_WAITS) {
          const wait = e.details.retryAfter
          const s = typeof wait === 'number' ? wait : 5
          r.onWait?.(s)
          await sleep(s * 1000, r.signal)
          continue
        }
        r.onRow(i, { target: t, status: 'error', result: '', detail: e ? `${e.code}: ${e.message}` : String(err) })
        return
      }
    }
  }
  async function worker() {
    while (next < targets.length && !r.signal?.aborted)
      await one(next++)
  }
  await Promise.all(Array.from({ length: Math.min(r.concurrency ?? 2, targets.length) }, worker))
}
