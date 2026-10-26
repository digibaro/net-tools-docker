import { Report } from '@vicons/tabler'
import { translate } from '@/plugins/i18n.plugin'
import { defineTool } from '../tool'

export const tool = defineTool({
  name: translate('tools.email-deliverability-report.title'),
  path: '/email-deliverability-report',
  description: translate('tools.email-deliverability-report.description'),
  keywords: ['deliverability', 'email check', 'spf dkim dmarc', 'mta-sts', 'dane', 'mail tester', 'mx check', 'fcrdns', 'email report'],
  component: () => import('./email-deliverability-report.vue'),
  icon: Report,
  createdAt: new Date('2026-10-27'),
  runMode: 'server',
  capability: 'email.spf',
})
