import { ReportMedical } from '@vicons/tabler'
import { translate } from '@/plugins/i18n.plugin'
import { defineTool } from '../tool'

export const tool = defineTool({
  name: translate('tools.dns-health-report.title'),
  path: '/dns-health-report',
  description: translate('tools.dns-health-report.description'),
  keywords: ['dns health', 'dns check', 'zone check', 'lame delegation', 'soa', 'nameserver', 'dnssec', 'edns', 'intodns', 'dns report'],
  component: () => import('./dns-health-report.vue'),
  icon: ReportMedical,
  createdAt: new Date('2026-10-27'),
  runMode: 'server',
  capability: 'dns.consistency',
})
