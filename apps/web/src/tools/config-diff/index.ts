import { GitCompare } from '@vicons/tabler'
import { translate } from '@/plugins/i18n.plugin'
import { defineTool } from '../tool'

export const tool = defineTool({
  name: translate('tools.config-diff.title'),
  path: '/config-diff',
  description: translate('tools.config-diff.description'),
  keywords: ['config diff', 'compare configs', 'running-config', 'startup-config', 'cisco', 'junos', 'arista', 'change review'],
  component: () => import('./config-diff.vue'),
  icon: GitCompare,
  createdAt: new Date('2026-10-27'),
  runMode: 'browser',
})
