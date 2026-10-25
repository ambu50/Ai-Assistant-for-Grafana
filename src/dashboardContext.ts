import type { PluginExtensionPanelContext } from '@grafana/data';

export interface DashboardContext {
  dashboardUid: string;
  dashboardTitle?: string;
  panelId?: number;
  panelTitle?: string;
  queries?: unknown[];
  from?: string;
  to?: string;
  timezone?: string;
  variables: Record<string, string[]>;
  capturedAt: string;
}
export function contextFromLocation(pathname: string, search: string): DashboardContext | undefined {
  const match = pathname.match(/\/(?:d|d-solo)\/([^/]+)/);
  if (!match) return;
  let dashboardUid: string;
  try { dashboardUid = decodeURIComponent(match[1]); } catch { return; }
  const params = new URLSearchParams(search);
  const variables: Record<string, string[]> = Object.create(null);
  for (const key of params.keys()) if (key.startsWith('var-')) variables[key.slice(4)] = params.getAll(key);
  return { dashboardUid, from: params.get('from') || 'now-1h', to: params.get('to') || 'now',
    timezone: params.get('timezone') || undefined, variables, capturedAt: new Date().toISOString() };
}
export function contextFromPanel(panel: Readonly<PluginExtensionPanelContext>, pathname: string, search: string): DashboardContext {
  const location = contextFromLocation(pathname, search);
  return {
    ...location,
    dashboardUid: panel.dashboard.uid,
    dashboardTitle: panel.dashboard.title,
    panelId: panel.id,
    panelTitle: panel.title,
    queries: panel.targets,
    from: String(panel.timeRange.from),
    to: String(panel.timeRange.to),
    timezone: panel.timeZone,
    variables: location?.variables || {},
    capturedAt: new Date().toISOString(),
  };
}
