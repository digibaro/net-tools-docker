import { ListDetails } from '@vicons/tabler'
import { translate } from '@/plugins/i18n.plugin'
import { defineTool } from '../tool'

export const tool = defineTool({
  name: translate('tools.bulk-lookup.title'),
  path: '/bulk-lookup',
  description: translate('tools.bulk-lookup.description'),
  keywords: ['bulk', 'batch', 'list', 'many', 'dns', 'reverse', 'ptr', 'asn', 'port', 'csv', 'targets'],
  component: () => import('./bulk-lookup.vue'),
  icon: ListDetails,
  createdAt: new Date('2026-10-27'),
  runMode: 'server',
  capability: 'dns.lookup',
})
