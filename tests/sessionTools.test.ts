import { beforeEach, describe, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@grafana/runtime', () => ({ getBackendSrv: () => api }));
import { SessionToolClient } from '../src/sessionTools';
const client = new SessionToolClient();
beforeEach(() => vi.resetAllMocks());
describe('session authenticated tool boundary', () => {
  it('does not offer arbitrary requests, permission administration, or service account tools', async () => {
    const names = (await client.listTools()).tools.map(t => t.name);
    expect(names).toContain('update_dashboard');
    await expect(client.callTool({ name: 'delete_dashboard', arguments: { uid: 'target' } })).rejects.toThrow('not supported');
    expect(api.get).not.toHaveBeenCalled(); expect(api.post).not.toHaveBeenCalled();
  });
  it('propagates a server denial without fallback even when model-supplied roles and permissions claim admin', async () => {
    const denial = { status: 403, data: { message: 'Access denied' } };
    api.get.mockResolvedValue({ meta: { canSave: true } });
    api.post.mockRejectedValue(denial);
    await expect(client.callTool({ name: 'update_dashboard', arguments: { dashboard: { uid: 'admin-dashboard', panels: [], canSave: true }, userId: 1, isAdmin: true, token: 'forged', url: '/api/admin' } })).rejects.toBe(denial);
    expect(api.post).toHaveBeenCalledExactlyOnceWith('/api/dashboards/db', { dashboard: { uid: 'admin-dashboard', panels: [], canSave: true }, overwrite: false, message: 'AI Assistant dashboard update' });
    expect(api.get).toHaveBeenCalledExactlyOnceWith('/api/dashboards/uid/admin-dashboard');
  });
  it('does not attempt a patch save when the real session cannot save the target', async () => {
    api.get.mockResolvedValue({ dashboard: { uid: 'target', panels: [1] }, meta: { canSave: false } });
    await expect(client.callTool({ name: 'update_dashboard', arguments: { uid: 'target', operations: [{ op: 'remove', path: '/panels/0' }] } })).rejects.toThrow('Permission denied');
    expect(api.post).not.toHaveBeenCalled();
  });
  it('uses the normal save endpoint for allowed edits and still propagates permission revocation at save time', async () => {
    api.get.mockResolvedValue({ dashboard: { uid: 'target', panels: [{ id: 1 }] }, meta: { canSave: true, folderUid: 'ops' } });
    api.post.mockRejectedValue({ status: 403 });
    await expect(client.callTool({ name: 'update_dashboard', arguments: { uid: 'target', operations: [{ op: 'remove', path: '/panels/0' }] } })).rejects.toMatchObject({ status: 403 });
    expect(api.post).toHaveBeenCalledExactlyOnceWith('/api/dashboards/db', expect.objectContaining({ dashboard: { uid: 'target', panels: [] }, folderUid: 'ops' }));
  });
  it('routes telemetry queries through the current user datasource proxy and rejects URL/path injection', async () => {
    await client.callTool({ name: 'query_prometheus', arguments: { datasourceUid: 'p', expr: 'up' } });
    expect(api.get).toHaveBeenCalledExactlyOnceWith('/api/datasources/proxy/uid/p/api/v1/query', { query: 'up' });
    api.get.mockClear();
    await expect(client.callTool({ name: 'get_dashboard_by_uid', arguments: { uid: '../admin/users' } })).rejects.toThrow('valid');
    expect(api.get).not.toHaveBeenCalled();
  });
});
it('still permits an authorized edit through the same session endpoint and preserves the folder', async () => {
  api.get.mockResolvedValue({ dashboard: { uid: 'editable', panels: [] }, meta: { canSave: true, folderUid: 'team' } });
  api.post.mockResolvedValue({ uid: 'editable', status: 'success', version: 2 });
  await expect(client.callTool({ name: 'update_dashboard', arguments: { dashboard: { uid: 'editable', panels: [{ id: 1 }] } } })).resolves.toMatchObject({ status: 'success' });
  expect(api.post).toHaveBeenCalledExactlyOnceWith('/api/dashboards/db', expect.objectContaining({ folderUid: 'team', dashboard: { uid: 'editable', panels: [{ id: 1 }] } }));
});
it('does not expose datasource credentials or connection details to the model', async () => {
  api.get.mockResolvedValue([{ uid: 'p', name: 'Metrics', type: 'prometheus', url: 'private', basicAuthUser: 'secret', jsonData: { token: 'secret' } }]);
  await expect(client.callTool({ name: 'list_datasources', arguments: {} })).resolves.toEqual([{ uid: 'p', name: 'Metrics', type: 'prometheus' }]);
});
