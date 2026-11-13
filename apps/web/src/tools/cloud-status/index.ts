import { Activity } from '@vicons/tabler'
import { translate } from '@/plugins/i18n.plugin'
import { defineTool } from '../tool'

export const tool = defineTool({
  name: translate('tools.cloud-status.title'),
  path: '/cloud-status',
  description: translate('tools.cloud-status.description'),
  keywords: ['status', 'outage', 'down', 'storing', 'microsoft 365', 'azure', 'aws', 'google workspace', 'cloudflare', 'github', 'openai', 'slack', 'incident', 'service health'],
  component: () => import('./cloud-status.vue'),
  icon: Activity,
  createdAt: new Date('2026-11-13'),
  runMode: 'public-api',
  capability: 'status.cloud',
})
