export interface Sample { seq: number, at: number, rtt: number | null }
export interface Bucket { minute: number, sent: number, received: number, lossPct: number, min: number, avg: number, p95: number, max: number }

const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0
const round = (n: number) => Math.round(n * 100) / 100

/** Per-minute buckets from sent probes (a probe without reply counts as lost). */
export function buckets(samples: Sample[], start: number): Bucket[] {
  const m = new Map<number, Sample[]>()
  for (const s of samples) {
    const minute = Math.floor((s.at - start) / 60_000)
    m.set(minute, [...(m.get(minute) ?? []), s])
  }
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([minute, list]) => {
    const ok = list.map(s => s.rtt).filter((r): r is number => r !== null).sort((a, b) => a - b)
    return { minute, sent: list.length, received: ok.length, lossPct: round((1 - ok.length / list.length) * 100), min: round(ok[0] ?? 0), avg: round(ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : 0), p95: round(pct(ok, 0.95)), max: round(ok.at(-1) ?? 0) }
  })
}

/** Overall statistics; jitter is the mean difference between consecutive replies (RFC 3550 style). */
export function overall(samples: Sample[]) {
  const ok = samples.map(s => s.rtt).filter((r): r is number => r !== null)
  const sorted = [...ok].sort((a, b) => a - b)
  const jitter = ok.length > 1 ? ok.slice(1).reduce((a, v, i) => a + Math.abs(v - ok[i]!), 0) / (ok.length - 1) : 0
  return { sent: samples.length, received: ok.length, lossPct: samples.length ? round((1 - ok.length / samples.length) * 100) : 0, min: round(sorted[0] ?? 0), median: round(pct(sorted, 0.5)), p95: round(pct(sorted, 0.95)), max: round(sorted.at(-1) ?? 0), jitter: round(jitter) }
}
