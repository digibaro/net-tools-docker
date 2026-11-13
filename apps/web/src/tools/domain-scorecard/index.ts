import { Award } from '@vicons/tabler'
import { translate } from '@/plugins/i18n.plugin'
import { defineTool } from '../tool'

export const tool = defineTool({
  name: translate('tools.domain-scorecard.title'),
  path: '/domain-scorecard',
  description: translate('tools.domain-scorecard.description'),
  keywords: ['internet.nl', 'hardenize', 'score', 'scorecard', 'website test', 'domain test', 'ipv6', 'https', 'dnssec', 'email security', 'report', 'audit'],
  component: () => import('./domain-scorecard.vue'),
  icon: Award,
  createdAt: new Date('2026-11-13'),
  runMode: 'server',
  capability: 'web.secheaders',
  accepts: { domain: 'domain' },
})
