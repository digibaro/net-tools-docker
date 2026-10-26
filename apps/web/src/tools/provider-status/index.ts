import { PlugConnected } from '@vicons/tabler'
import { translate } from '@/plugins/i18n.plugin'
import { defineTool } from '../tool'

export const tool = defineTool({
  name: translate('tools.provider-status.title'),
  path: '/provider-status',
  description: translate('tools.provider-status.description'),
  keywords: ['status', 'providers', 'api keys', 'ripestat', 'abuseipdb', 'virustotal', 'ipinfo', 'health', 'service status'],
  component: () => import('./provider-status.vue'),
  icon: PlugConnected,
  createdAt: new Date('2026-10-27'),
  runMode: 'server',
  capability: 'sys.providers',
})
