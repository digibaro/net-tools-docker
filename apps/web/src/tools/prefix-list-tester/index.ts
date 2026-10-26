import { Filter } from '@vicons/tabler'
import { translate } from '@/plugins/i18n.plugin'
import { defineTool } from '../tool'

export const tool = defineTool({
  name: translate('tools.prefix-list-tester.title'),
  path: '/prefix-list-tester',
  description: translate('tools.prefix-list-tester.description'),
  keywords: ['prefix-list', 'prefix list', 'route-filter', 'ge le', 'orlonger', 'upto', 'route map', 'bgp filter', 'cisco', 'junos'],
  component: () => import('./prefix-list-tester.vue'),
  icon: Filter,
  createdAt: new Date('2026-10-27'),
  runMode: 'browser',
})
