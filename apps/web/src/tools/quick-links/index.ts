import { Bookmarks } from '@vicons/tabler'
import { translate } from '@/plugins/i18n.plugin'
import { defineTool } from '../tool'

export const tool = defineTool({
  name: translate('tools.quick-links.title'),
  path: '/quick-links',
  description: translate('tools.quick-links.description'),
  keywords: ['links', 'bookmarks', 'portal', 'admin', 'dashboard', 'favourites', 'beheer', 'console'],
  component: () => import('./quick-links.vue'),
  icon: Bookmarks,
  createdAt: new Date('2026-11-13'),
  runMode: 'server',
  capability: 'dash.links',
})
