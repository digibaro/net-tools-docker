import { parseIP } from '@/utils/ip'

/** One browser-side probe; all endpoints are keyless, CORS-enabled and allowed by the CSP. */
export interface ProbeSpec {
  id: 'v4' | 'v6' | 'dual' | 'v4literal'
  url: string
  /** Pulls the client address out of the response body. */
  parse: (body: string) => string | undefined
}

function ipify(body: string) {
  try {
    return (JSON.parse(body) as { ip?: string }).ip
  }
  catch {
    return undefined
  }
}
/** Cloudflare's /cdn-cgi/trace: key=value lines, one of them ip=. */
export const cfTrace = (body: string) => /^ip=(.+)$/m.exec(body)?.[1]?.trim()

export const PROBES: ProbeSpec[] = [
  { id: 'v4', url: 'https://api.ipify.org?format=json', parse: ipify },
  { id: 'v6', url: 'https://api6.ipify.org?format=json', parse: ipify },
  { id: 'dual', url: 'https://api64.ipify.org?format=json', parse: ipify },
  { id: 'v4literal', url: 'https://1.1.1.1/cdn-cgi/trace', parse: cfTrace },
]

export interface ProbeResult {
  id: ProbeSpec['id']
  ok: boolean
  ip?: string
  family?: 4 | 6
  ms: number
  error?: 'timeout' | 'network' | 'parse'
}

export async function runProbe(p: ProbeSpec, timeoutMs = 8000, fetchFn: typeof fetch = fetch): Promise<ProbeResult> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  const start = performance.now()
  try {
    const res = await fetchFn(p.url, { cache: 'no-store', signal: ctrl.signal, credentials: 'omit', referrerPolicy: 'no-referrer' })
    const ip = p.parse(await res.text())
    const ms = Math.round(performance.now() - start)
    const a = ip ? parseIP(ip) : undefined
    return a ? { id: p.id, ok: true, ip, family: a.version, ms } : { id: p.id, ok: false, ms, error: 'parse' }
  }
  catch {
    const ms = Math.round(performance.now() - start)
    return { id: p.id, ok: false, ms, error: ctrl.signal.aborted ? 'timeout' : 'network' }
  }
  finally {
    clearTimeout(timer)
  }
}

export type Verdict = 'ipv6-ok' | 'ipv4-only' | 'ipv6-only' | 'broken' | 'offline'

export interface Assessment {
  verdict: Verdict
  /** 0–10, how ready this connection is for IPv6 (test-ipv6.com style). */
  score: number
  /** Dual-stack sites use IPv6 from this browser. */
  prefersV6: boolean
  /** Dual-stack is noticeably slower than IPv4 alone (Happy Eyeballs fallback from broken IPv6). */
  slowFallback: boolean
}

export function assess(results: ProbeResult[]): Assessment {
  const r = Object.fromEntries(results.map(x => [x.id, x])) as Partial<Record<ProbeSpec['id'], ProbeResult>>
  const v4 = !!r.v4?.ok || !!r.v4literal?.ok
  const v6 = !!r.v6?.ok && r.v6.family === 6
  const dual = r.dual
  const prefersV6 = !!dual?.ok && dual.family === 6
  const slowFallback = !!dual?.ok && !!r.v4?.ok && dual.family === 4 && dual.ms - r.v4.ms > 1000
  let score = 0
  if (v6)
    score += 5
  if (prefersV6)
    score += 3
  if (dual?.ok)
    score += 2
  if (slowFallback)
    score = Math.max(0, score - 2)
  const verdict: Verdict = !v4 && !v6 ? 'offline' : dual && !dual.ok ? 'broken' : v6 && v4 ? 'ipv6-ok' : v6 ? 'ipv6-only' : 'ipv4-only'
  return { verdict, score: verdict === 'broken' ? Math.min(score, 3) : score, prefersV6, slowFallback }
}
