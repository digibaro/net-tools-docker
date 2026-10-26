import { FileReport } from '@vicons/tabler'
import { translate } from '@/plugins/i18n.plugin'
import { defineTool } from '../tool'

export const tool = defineTool({
  name: translate('tools.tls-rpt-viewer.title'),
  path: '/tls-rpt-viewer',
  description: translate('tools.tls-rpt-viewer.description'),
  keywords: ['tls-rpt', 'smtp tls reporting', 'rfc 8460', 'mta-sts', 'dane', 'tls report', 'json report'],
  component: () => import('./tls-rpt-viewer.vue'),
  icon: FileReport,
  createdAt: new Date('2026-10-27'),
  runMode: 'browser',
})
