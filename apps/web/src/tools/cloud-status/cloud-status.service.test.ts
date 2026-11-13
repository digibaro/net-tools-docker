import type { CloudService } from './cloud-status.service'
import { describe, expect, it } from 'vitest'
import { filterServices, safeUrl, sortServices, stateTag, summarize } from './cloud-status.service'

function svc(id: string, state: CloudService['state'], incidents: CloudService['incidents'] = []): CloudService {
  return { id, name: id.toUpperCase(), group: 'g', kind: state === 'link' ? 'link' : 'statuspage', page: `https://${id}.test/`, state, incidents, components: [], error: '' }
}

const list = [svc('a', 'operational'), svc('l', 'link'), svc('b', 'outage'), svc('c', 'unknown'), svc('d', 'degraded', [{ title: 'Mail delays', impact: 'degraded', status: '', started: '', updated: '', url: '' }])]

describe('cloud-status', () => {
  it('sorts problems first and keeps feed order within a state', () => {
    expect(sortServices(list).map(s => s.id)).toEqual(['b', 'd', 'c', 'a', 'l'])
  })

  it('summarizes without counting links', () => {
    expect(summarize(list)).toEqual({ total: 4, problems: 2, unknown: 1 })
  })

  it('maps states to tag types', () => {
    expect(stateTag('outage')).toBe('error')
    expect(stateTag('operational')).toBe('success')
  })

  it('only allows https links', () => {
    expect(safeUrl('https://status.test/x')).toBe('https://status.test/x')
    expect(safeUrl('javascript:alert(1)')).toBeUndefined()
    expect(safeUrl('http://status.test/')).toBeUndefined()
    expect(safeUrl('not a url')).toBeUndefined()
  })

  it('filters by name, incident title and problems', () => {
    expect(filterServices(list, 'mail', false).map(s => s.id)).toEqual(['d'])
    expect(filterServices(list, '', true).map(s => s.id)).toEqual(['b', 'c', 'd'])
  })
})
