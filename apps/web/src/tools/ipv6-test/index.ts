import { Number6 } from '@vicons/tabler'
import { translate } from '@/plugins/i18n.plugin'
import { defineTool } from '../tool'

export const tool = defineTool({
  name: translate('tools.ipv6-test.title'),
  path: '/ipv6-test',
  description: translate('tools.ipv6-test.description'),
  keywords: ['ipv6', 'test-ipv6', 'dual stack', 'happy eyeballs', 'my connection', 'ipv6 test', 'is my ipv6 working', 'nat64'],
  component: () => import('./ipv6-test.vue'),
  icon: Number6,
  createdAt: new Date('2026-11-13'),
  runMode: 'browser',
})
