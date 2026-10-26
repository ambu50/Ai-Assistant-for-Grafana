import { expect, it, vi } from 'vitest';
const registered = vi.hoisted(() => ({ links: [] as any[], location: { pathname: '/grafana/d/target/cluster', search: '?from=now-6h&var-host=node-1' } }));
vi.mock('@grafana/data', () => ({
  PluginExtensionPoints: { DashboardPanelMenu: 'grafana/dashboard/panel/menu', CommandPalette: 'grafana/commandpalette/action' },
  AppPlugin: class { setRootPage() { return this; } addLink(link: any) { registered.links.push(link); return this; } },
}));
vi.mock('@grafana/runtime', () => ({ config: { appSubUrl: '/grafana' }, locationService: { getLocation: () => registered.location } }));
it('registers discoverable dashboard and command-palette launchers without navigating away', async () => {
  vi.stubGlobal('__webpack_public_path__', '');
  await import('../src/module');
  const metadata = (await import('../src/plugin.json')).default;
  expect(metadata.preload).toBe(true);
  expect(registered.links.map(link => link.targets[0])).toEqual(metadata.extensions.addedLinks.map(link => link.targets[0]));
  const modal = vi.fn();
  registered.links[1].onClick(undefined, { openModal: modal });
  expect(modal).toHaveBeenCalledWith(expect.objectContaining({ title: 'AI Assistant' }));
  const body = modal.mock.calls[0][0].body();
  expect(body.props.children.props.viewContext).toMatchObject({ dashboardUid: 'target', from: 'now-6h', variables: { host: ['node-1'] } });
  const panel = { id: 7, title: 'CPU', dashboard: { uid: 'panel-dashboard', title: 'Panel dashboard' }, targets: [{ refId: 'A', expr: 'cpu' }], timeRange: { from: 'now-15m', to: 'now' }, timeZone: 'utc' };
  registered.links[0].onClick(undefined, { context: panel, openModal: modal });
  expect(modal.mock.calls[1][0].body().props.children.props.viewContext).toMatchObject({ dashboardUid: 'panel-dashboard', panelId: 7, queries: panel.targets });
});
