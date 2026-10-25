import { describe, expect, it } from 'vitest';
import { contextFromLocation, contextFromPanel } from '../src/dashboardContext';
import type { PluginExtensionPanelContext } from '@grafana/data';

describe('dashboard chat context', () => {
  it('captures dashboard UID, time and repeated variables under a Grafana subpath', () => {
    expect(contextFromLocation('/grafana/d/cluster-uid/cluster', '?from=now-6h&to=now&var-host=a&var-host=b&timezone=utc&token=secret')).toMatchObject({ dashboardUid: 'cluster-uid', from: 'now-6h', to: 'now', timezone: 'utc', variables: { host: ['a', 'b'] } });
    expect(JSON.stringify(contextFromLocation('/d/uid', '?token=secret'))).not.toContain('secret');
    expect(contextFromLocation('/dashboards', '')).toBeUndefined();
    expect(contextFromLocation('/d/%invalid', '')).toBeUndefined();
  });
  it('uses authoritative panel context for dashboard, panel, queries and time', () => {
    const targets = [{ refId: 'A', expr: 'cpu' }];
    const panel = { pluginId: 'timeseries', dashboard: { uid: 'actual', title: 'Cluster', tags: [] }, id: 7, title: 'CPU', targets, timeRange: { from: 'now-15m', to: 'now' }, timeZone: 'browser' } as PluginExtensionPanelContext;
    expect(contextFromPanel(panel, '/d/other/other', '?var-host=node')).toMatchObject({ dashboardUid: 'actual', dashboardTitle: 'Cluster', panelId: 7, panelTitle: 'CPU', queries: panel.targets, from: 'now-15m', variables: { host: ['node'] } });
  });
});
