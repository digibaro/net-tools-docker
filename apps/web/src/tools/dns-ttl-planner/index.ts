import { CalendarTime } from '@vicons/tabler'
import { translate } from '@/plugins/i18n.plugin'
import { defineTool } from '../tool'

export const tool = defineTool({
  name: translate('tools.dns-ttl-planner.title'),
  path: '/dns-ttl-planner',
  description: translate('tools.dns-ttl-planner.description'),
  keywords: ['ttl', 'dns migration', 'cutover', 'lower ttl', 'propagation', 'change window', 'ics'],
  component: () => import('./dns-ttl-planner.vue'),
  icon: CalendarTime,
  createdAt: new Date('2026-10-27'),
  runMode: 'hybrid',
})
