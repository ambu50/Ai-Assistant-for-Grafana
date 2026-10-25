import { AppPlugin, PluginExtensionPoints, type PluginExtensionPanelContext, type PluginExtensionEventHelpers } from '@grafana/data';
import { config, locationService } from '@grafana/runtime';
import React, { lazy, Suspense } from 'react';
import { contextFromLocation, contextFromPanel, type DashboardContext } from './dashboardContext';
declare let __webpack_public_path__: string;
__webpack_public_path__ = `${config.appSubUrl}/public/plugins/ai-assistant-app/`;
const App = lazy(() => import('./App').then(module => ({ default: module.App })).catch(error => {
  console.error('AI Assistant initialization failed:', error);
  return { default: () => React.createElement('div', { role: 'alert' }, `Unable to initialize AI Assistant: ${String(error)}`) };
}));
function openChat(helpers: PluginExtensionEventHelpers<any>, viewContext?: DashboardContext) {
  helpers.openModal({
    title: 'AI Assistant', width: 'min(920px, 94vw)', height: '85vh',
    body: () => React.createElement(Suspense, { fallback: 'Loading AI Assistant…' }, React.createElement(App, { compact: true, viewContext })),
  });
}
export const plugin = new AppPlugin().setRootPage(props => React.createElement(Suspense, { fallback: 'Loading AI Assistant…' }, React.createElement(App, props)))
  .addLink<PluginExtensionPanelContext>({
    title: 'Ask AI Assistant', description: 'Chat about this panel and dashboard without leaving the dashboard',
    targets: [PluginExtensionPoints.DashboardPanelMenu], icon: 'comments-alt',
    onClick: (_event, helpers) => {
      const location = locationService.getLocation();
      openChat(helpers, helpers.context ? contextFromPanel(helpers.context, location.pathname, location.search || '') : contextFromLocation(location.pathname, location.search || ''));
    },
  })
  .addLink({
    title: 'AI Assistant chat', description: 'Open an assistant conversation with the current dashboard as context',
    targets: [PluginExtensionPoints.CommandPalette], icon: 'comments-alt',
    onClick: (_event, helpers) => {
      const location = locationService.getLocation();
      if (location.pathname.startsWith(`${config.appSubUrl}/a/ai-assistant-app`)) return;
      openChat(helpers, contextFromLocation(location.pathname, location.search || ''));
    },
  });
