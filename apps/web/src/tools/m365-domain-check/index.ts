import { BrandWindows } from '@vicons/tabler'
import { translate } from '@/plugins/i18n.plugin'
import { defineTool } from '../tool'

export const tool = defineTool({
  name: translate('tools.m365-domain-check.title'),
  path: '/m365-domain-check',
  description: translate('tools.m365-domain-check.description'),
  keywords: ['microsoft 365', 'office 365', 'm365', 'o365', 'exchange online', 'autodiscover', 'tenant', 'entra', 'azure ad', 'intune', 'teams', 'dkim selector1', 'remote connectivity'],
  component: () => import('./m365-domain-check.vue'),
  icon: BrandWindows,
  createdAt: new Date('2026-11-13'),
  runMode: 'server',
  capability: 'email.m365',
})
