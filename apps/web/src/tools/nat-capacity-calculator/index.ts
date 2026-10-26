import { ArrowsSplit } from '@vicons/tabler'
import { translate } from '@/plugins/i18n.plugin'
import { defineTool } from '../tool'

export const tool = defineTool({
  name: translate('tools.nat-capacity-calculator.title'),
  path: '/nat-capacity-calculator',
  description: translate('tools.nat-capacity-calculator.description'),
  keywords: ['nat', 'pat', 'cgnat', 'port block', 'sessions per ip', 'nat44', 'deterministic nat', 'ephemeral ports'],
  component: () => import('./nat-capacity-calculator.vue'),
  icon: ArrowsSplit,
  createdAt: new Date('2026-10-27'),
  runMode: 'browser',
})
