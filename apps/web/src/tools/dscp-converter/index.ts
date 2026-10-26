import { Tags } from '@vicons/tabler'
import { translate } from '@/plugins/i18n.plugin'
import { defineTool } from '../tool'

export const tool = defineTool({
  name: translate('tools.dscp-converter.title'),
  path: '/dscp-converter',
  description: translate('tools.dscp-converter.description'),
  keywords: ['dscp', 'tos', 'cos', '802.1p', 'qos', 'phb', 'ef', 'af41', 'ip precedence', 'traffic class'],
  component: () => import('./dscp-converter.vue'),
  icon: Tags,
  createdAt: new Date('2026-10-27'),
  runMode: 'browser',
})
