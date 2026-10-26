import { Stack2 } from '@vicons/tabler'
import { translate } from '@/plugins/i18n.plugin'
import { defineTool } from '../tool'

export const tool = defineTool({
  name: translate('tools.subnet-overlap-checker.title'),
  path: '/subnet-overlap-checker',
  description: translate('tools.subnet-overlap-checker.description'),
  keywords: ['overlap', 'subnet conflict', 'ip conflict', 'vpn overlap', 'vpc overlap', 'duplicate prefix', 'merge networks'],
  component: () => import('./subnet-overlap-checker.vue'),
  icon: Stack2,
  createdAt: new Date('2026-10-27'),
  runMode: 'browser',
})
