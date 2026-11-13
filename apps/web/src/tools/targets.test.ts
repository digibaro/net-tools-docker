import type { Tool } from './tool'
import { describe, expect, it } from 'vitest'
import { derived, detectTarget, externalLinks, quickActions, targetFromQuery } from './targets'

describe('detectTarget', () => {
  it.each([
    ['1.1.1.1', 'ip', '1.1.1.1'],
    ['2001:DB8::1', 'ip', '2001:db8::1'],
    ['[2001:db8::1]', 'ip', '2001:db8::1'],
    ['1.1.1.0/24', 'prefix', '1.1.1.0/24'],
    ['2001:db8::/32', 'prefix', '2001:db8::/32'],
    ['AS13335', 'asn', 'AS13335'],
    ['as 1136', 'asn', 'AS1136'],
    ['Example.COM.', 'domain', 'example.com'],
    ['bücher.de', 'domain', 'bücher.de'],
    ['https://example.com/a?b=1', 'url', 'https://example.com/a?b=1'],
    ['Info@Example.nl', 'email', 'info@example.nl'],
    ['00:11:22:33:44:55', 'mac', '00:11:22:33:44:55'],
  ])('%s → %s', (input, kind, value) => {
    expect(detectTarget(input)).toEqual({ kind, value })
  })

  it.each(['dns lookup', 'ping', 'localhost', '', '1.2.3', '13335', 'ftp://x.test', 'a@b', 'https://u:p@x.test/', '999.1.1.1', '10.0.0.0/33', 'aabbccddeeff00'])('ignores %j', (input) => {
    expect(detectTarget(input)).toBeUndefined()
  })
})

describe('derived', () => {
  it('adds the host of a URL and the domain of an e-mail address', () => {
    expect(derived({ kind: 'url', value: 'https://www.example.com/x' })[1]).toEqual({ kind: 'domain', value: 'www.example.com' })
    expect(derived({ kind: 'url', value: 'http://[2001:db8::1]:8080/' })[1]).toEqual({ kind: 'ip', value: '2001:db8::1' })
    expect(derived({ kind: 'email', value: 'a@example.nl' })[1]).toEqual({ kind: 'domain', value: 'example.nl' })
  })
})

const tool = (path: string, accepts: Tool['accepts']) => ({ path, accepts } as Tool)

describe('quickActions', () => {
  const tools = [tool('/dns-lookup', { domain: 'name' }), tool('/ip-geolocation', { ip: 'ip' }), tool('/http-request', { url: 'url' }), tool('/rdap-lookup', { ip: 'query', domain: 'query', asn: 'query' }), tool('/x', undefined)]

  it('fills the parameter of every tool that takes the target', () => {
    expect(quickActions({ kind: 'ip', value: '1.1.1.1' }, tools).map(a => a.to)).toEqual(['/ip-geolocation?ip=1.1.1.1', '/rdap-lookup?query=1.1.1.1'])
  })

  it('uses the URL itself first, then its host', () => {
    expect(quickActions({ kind: 'url', value: 'https://example.com/a b' }, tools).map(a => a.to)).toEqual([
      '/dns-lookup?name=example.com',
      '/http-request?url=https%3A%2F%2Fexample.com%2Fa+b',
      '/rdap-lookup?query=example.com',
    ])
  })
})

describe('targetFromQuery', () => {
  it('reads the declared parameter', () => {
    expect(targetFromQuery({ accepts: { domain: 'name' } }, { name: 'example.com' })).toEqual({ kind: 'domain', value: 'example.com' })
    expect(targetFromQuery({ accepts: { url: 'url' } }, { url: 'example.com' })).toEqual({ kind: 'domain', value: 'example.com' })
    expect(targetFromQuery({ accepts: { ip: 'query', asn: 'query' } }, { query: 'AS1' })).toEqual({ kind: 'asn', value: 'AS1' })
    expect(targetFromQuery({ accepts: { domain: 'name' } }, { name: 'not valid!' })).toBeUndefined()
    expect(targetFromQuery({ accepts: { asn: 'asn' } }, { asn: 'example.com' })).toBeUndefined()
    expect(targetFromQuery({}, { name: 'example.com' })).toBeUndefined()
  })
})

describe('externalLinks', () => {
  it('builds encoded https links per kind', () => {
    const ip = externalLinks({ kind: 'ip', value: '2001:db8::1' })
    expect(ip.find(l => l.id === 'shodan')?.url).toBe('https://www.shodan.io/host/2001%3Adb8%3A%3A1')
    expect(externalLinks({ kind: 'asn', value: 'AS13335' }).map(l => l.url)).toContain('https://bgp.he.net/AS13335')
    expect(externalLinks({ kind: 'domain', value: 'example.nl' }).some(l => l.id === 'sidn')).toBe(true)
    expect(externalLinks({ kind: 'domain', value: 'example.com' }).some(l => l.id === 'sidn')).toBe(false)
  })

  it('adds the host links for a URL without duplicate sites', () => {
    const links = externalLinks({ kind: 'url', value: 'https://example.com/' })
    expect(links[0]!.id).toBe('urlscan')
    expect(new Set(links.map(l => l.id)).size).toBe(links.length)
    expect(links.some(l => l.id === 'crtsh')).toBe(true)
  })

  it('only produces https URLs', () => {
    for (const t of [{ kind: 'ip', value: '8.8.8.8' }, { kind: 'domain', value: 'a.test' }, { kind: 'prefix', value: '1.1.1.0/24' }, { kind: 'url', value: 'http://a.test/' }] as const)
      expect(externalLinks(t).every(l => l.url.startsWith('https://'))).toBe(true)
  })
})
