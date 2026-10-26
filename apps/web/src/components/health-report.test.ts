import { describe, expect, it } from 'vitest'
import { grade, sortChecks } from './health-report'

describe('health-report', () => {
  it('grades and sorts checks', () => {
    expect(grade([{ id: 'a', status: 'pass', detail: '' }])).toEqual({ score: 100, letter: 'A' })
    expect(grade([{ id: 'a', status: 'fail', detail: '' }, { id: 'b', status: 'warn', detail: '' }]).letter).toBe('C')
    expect(sortChecks([{ id: 'p', status: 'pass', detail: '' }, { id: 'f', status: 'fail', detail: '' }])[0]!.id).toBe('f')
  })
})
