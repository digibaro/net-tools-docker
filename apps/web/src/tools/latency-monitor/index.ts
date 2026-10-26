import { Activity } from '@vicons/tabler'
import { translate } from '@/plugins/i18n.plugin'
import { defineTool } from '../tool'

export const tool = defineTool({
  name: translate('tools.latency-monitor.title'),
  path: '/latency-monitor',
  description: translate('tools.latency-monitor.description'),
  keywords: ['smokeping', 'latency monitor', 'jitter', 'packet loss', 'long ping', 'continuous ping', 'line quality'],
  component: () => import('./latency-monitor.vue'),
  icon: Activity,
  createdAt: new Date('2026-10-27'),
  runMode: 'server',
  capability: 'net.monitor',
})
