import { Plug } from '@vicons/tabler'
import { translate } from '@/plugins/i18n.plugin'
import { defineTool } from '../tool'

export const tool = defineTool({
  name: translate('tools.poe-budget-calculator.title'),
  path: '/poe-budget-calculator',
  description: translate('tools.poe-budget-calculator.description'),
  keywords: ['poe', 'power over ethernet', '802.3af', '802.3at', '802.3bt', 'poe budget', 'switch power', 'access point power'],
  component: () => import('./poe-budget-calculator.vue'),
  icon: Plug,
  createdAt: new Date('2026-10-27'),
  runMode: 'browser',
})
