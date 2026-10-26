import { Report } from '@vicons/tabler'
import { translate } from '@/plugins/i18n.plugin'
import { defineTool } from '../tool'

export const tool = defineTool({
  name: translate('tools.report-bundle.title'),
  path: '/report-bundle',
  description: translate('tools.report-bundle.description'),
  keywords: ['report', 'bundle', 'export', 'markdown', 'print', 'pdf', 'collect', 'results', 'ticket'],
  component: () => import('./report-bundle.vue'),
  icon: Report,
  createdAt: new Date('2026-10-27'),
  runMode: 'browser',
})
