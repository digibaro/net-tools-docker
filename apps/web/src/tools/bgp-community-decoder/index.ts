import { Hash } from '@vicons/tabler'
import { translate } from '@/plugins/i18n.plugin'
import { defineTool } from '../tool'

export const tool = defineTool({
  name: translate('tools.bgp-community-decoder.title'),
  path: '/bgp-community-decoder',
  description: translate('tools.bgp-community-decoder.description'),
  keywords: ['bgp community', 'large community', 'extended community', 'rfc 1997', 'rfc 8092', 'no-export', 'blackhole', 'route target', 'route server'],
  component: () => import('./bgp-community-decoder.vue'),
  icon: Hash,
  createdAt: new Date('2026-10-27'),
  runMode: 'browser',
})
