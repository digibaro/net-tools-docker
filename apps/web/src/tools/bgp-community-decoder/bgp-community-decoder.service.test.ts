import { describe, expect, it } from 'vitest'
import { decodeAll, decodeOne } from './bgp-community-decoder.service'

describe('bgp-community-decoder', () => {
  it('decodes well-known and standard communities', () => {
    expect(decodeOne('65535:65281').meaning).toBe('NO_EXPORT')
    expect(decodeOne('no-export').value).toBe('65535:65281')
    expect(decodeOne('65535:666').meaning).toBe('BLACKHOLE')
    expect(decodeOne('0:3356').meaning).toContain('do not announce')
    expect(decodeOne('64512:10').meaning).toContain('private ASN')
    expect(decodeOne('4294901761').value).toBe('65535:1')
  })
  it('decodes large and extended communities', () => {
    expect(decodeOne('6695:0:3356')).toMatchObject({ kind: 'large', meaning: 'route server: do not announce to AS3356' })
    expect(decodeOne('rt:65000:100')).toMatchObject({ kind: 'extended', meaning: 'route target (2-byte AS)' })
    expect(decodeOne('0x0002fde800000064')).toMatchObject({ meaning: 'route target (2-byte AS)', value: '65000:100' })
    expect(decodeOne('8006000000000000').value).toBe('discard')
  })
  it('reads pasted show output', () => {
    const r = decodeAll('Community: 3356:2 3356:22 no-export\nLarge Community: 6695:1:13335')
    expect(r.map(x => x.kind)).toEqual(['standard', 'standard', 'standard', 'large'])
    expect(decodeOne('banana').valid).toBe(false)
  })
})
