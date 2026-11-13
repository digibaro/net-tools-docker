import type { QuickLink } from './quick-links.service'
import { describe, expect, it } from 'vitest'
import { groupLinks, hostOf, linkHref } from './quick-links.service'

const l = (name: string, group: string, url = `https://${name.toLowerCase()}.test/`, description = ''): QuickLink => ({ name, url, group, description })

describe('quick-links', () => {
  const links = [l('Entra', 'Microsoft'), l('NAS', '', 'http://nas.lan:5000/', 'Synology'), l('Azure', 'Microsoft'), l('TransIP', 'Hosting')]

  it('groups in first-seen order with a fallback group', () => {
    expect(groupLinks(links, '', 'Other').map(g => [g.name, g.links.map(x => x.name)])).toEqual([
      ['Microsoft', ['Entra', 'Azure']],
      ['Other', ['NAS']],
      ['Hosting', ['TransIP']],
    ])
  })

  it('filters on name, description, group and URL', () => {
    expect(groupLinks(links, 'synology', 'Other').flatMap(g => g.links.map(x => x.name))).toEqual(['NAS'])
    expect(groupLinks(links, 'microsoft', 'Other').flatMap(g => g.links.map(x => x.name))).toEqual(['Entra', 'Azure'])
  })

  it('only renders http(s) links', () => {
    expect(linkHref('http://nas.lan:5000/')).toBe('http://nas.lan:5000/')
    expect(linkHref('javascript:alert(1)')).toBeUndefined()
    expect(linkHref('data:text/html,x')).toBeUndefined()
    expect(hostOf('https://portal.azure.com/#home')).toBe('portal.azure.com')
  })
})
