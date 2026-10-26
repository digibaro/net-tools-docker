import type { ReportItem } from '@/composables/report'

/** Tool title for a report item; falls back to the path for tools that no longer exist. */
export function titleFor(item: ReportItem, tools: { path: string, name: string }[]): string {
  return tools.find(t => t.path === item.path)?.name ?? item.path
}

export const linkFor = (i: ReportItem) => `${i.path}${i.search ? `?${i.search}` : ''}`
