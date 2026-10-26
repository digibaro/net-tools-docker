import { expect, it, describe as suite } from 'vitest'
import { describe, parse } from './dscp-converter.service'

suite('dscp-converter', () => {
  it('parses every notation', () => {
    expect(parse('EF')).toBe(46)
    expect(parse('af41')).toBe(34)
    expect(parse('0xb8')).toBe(46)
    expect(parse('tos 184')).toBe(46)
    expect(parse('101110')).toBe(46)
    expect(parse('prec 5')).toBe(40)
    expect(parse('dscp 26')).toBe(26)
    expect(parse('64')).toBeUndefined()
  })
  it('describes a value', () => {
    expect(describe(46)).toMatchObject({ name: 'EF', tos: 184, tosHex: '0xb8', precedence: 5, cos: 5, binary: '101110' })
    expect(describe(36)).toMatchObject({ name: 'AF42', drop: 'medium', precedence: 4 })
  })
})
