import { AntennaBars5 } from '@vicons/tabler'
import { translate } from '@/plugins/i18n.plugin'
import { defineTool } from '../tool'

export const tool = defineTool({
  name: translate('tools.wireless-link-calculator.title'),
  path: '/wireless-link-calculator',
  description: translate('tools.wireless-link-calculator.description'),
  keywords: ['fresnel zone', 'free space path loss', 'fspl', 'eirp', 'link budget', 'point to point', 'wireless bridge', 'fade margin'],
  component: () => import('./wireless-link-calculator.vue'),
  icon: AntennaBars5,
  createdAt: new Date('2026-10-27'),
  runMode: 'browser',
})
