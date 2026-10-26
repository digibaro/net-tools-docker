import type { InjectionKey } from 'vue'
import { hasInjectionContext, inject } from 'vue'

/** Compare mode renders a tool twice; each copy prefixes its URL parameters ("a." / "b."). */
export interface QueryScope { prefix: string, path: string }
export const QUERY_SCOPE: InjectionKey<QueryScope> = Symbol('query-scope')

export function useQueryScope(): QueryScope | undefined {
  return hasInjectionContext() ? inject(QUERY_SCOPE, undefined) : undefined
}

/** The tool path and its own (unprefixed) query, as if the tool were open on its own page. */
export function scopedLocation(scope: QueryScope | undefined, loc: { pathname: string, search: string } = window.location): { path: string, search: string } {
  if (!scope)
    return { path: loc.pathname, search: loc.search }
  const own = new URLSearchParams()
  for (const [k, v] of new URLSearchParams(loc.search)) {
    if (k.startsWith(scope.prefix))
      own.append(k.slice(scope.prefix.length), v)
  }
  const s = own.toString()
  return { path: scope.path, search: s ? `?${s}` : '' }
}

/** Query for /compare from a tool's own query: both sides start with the same inputs. */
export function compareQuery(path: string, query: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = { tool: path }
  for (const [k, v] of Object.entries(query)) {
    const s = Array.isArray(v) ? v[0] : v
    if (typeof s === 'string') {
      out[`a.${k}`] = s
      out[`b.${k}`] = s
    }
  }
  return out
}
