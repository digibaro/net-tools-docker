import type { ReportItem } from '@/composables/report'
import { describe, expect, it } from 'vitest'
import { linkFor, titleFor } from './report-bundle.service'

const item = { path: '/ping', search: 'target=x' } as ReportItem

describe('report-bundle', () => {
  it('resolves titles and links', () => {
    expect(titleFor(item, [{ path: '/ping', name: 'Ping' }])).toBe('Ping')
    expect(titleFor(item, [])).toBe('/ping')
    expect(linkFor(item)).toBe('/ping?target=x')
    expect(linkFor({ ...item, search: '' })).toBe('/ping')
  })
})
