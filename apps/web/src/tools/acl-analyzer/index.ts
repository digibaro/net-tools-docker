import { LockAccess } from '@vicons/tabler'
import { translate } from '@/plugins/i18n.plugin'
import { defineTool } from '../tool'

export const tool = defineTool({
  name: translate('tools.acl-analyzer.title'),
  path: '/acl-analyzer',
  description: translate('tools.acl-analyzer.description'),
  keywords: ['acl', 'access list', 'firewall rules', 'shadowed rule', 'redundant rule', 'cisco acl', 'asa', 'packet tracer'],
  component: () => import('./acl-analyzer.vue'),
  icon: LockAccess,
  createdAt: new Date('2026-10-27'),
  runMode: 'browser',
})
