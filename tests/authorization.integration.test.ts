import { describe, expect, it, vi } from 'vitest';
const remote = vi.hoisted(() => {
  const request = async (path: string, params?: Record<string, unknown>, body?: unknown) => {
    const url = new URL(path, process.env.AI_TEST_GRAFANA_URL);
    for (const [key, value] of Object.entries(params || {})) url.searchParams.set(key, String(value));
    const response = await fetch(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: 'Basic ' + Buffer.from(`${process.env.AI_TEST_USER}:${process.env.AI_TEST_PASSWORD}`).toString('base64'), 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw { status: response.status };
    return response.json();
  };
  return { get: (path: string, params?: Record<string, unknown>) => request(path, params), post: (path: string, data: unknown) => request(path, undefined, data) };
});
vi.mock('@grafana/runtime', () => ({ getBackendSrv: () => remote }));
import { SessionToolClient } from '../src/sessionTools';
const enabled = !!(process.env.AI_TEST_GRAFANA_URL && process.env.AI_TEST_USER && process.env.AI_TEST_PASSWORD && process.env.AI_TEST_READONLY_DASHBOARD_UID);

describe.skipIf(!enabled)('live readonly-user authorization regression', () => {
  it('denies the dispatcher and a direct forged save, preserves the target', async () => {
    const uid = process.env.AI_TEST_READONLY_DASHBOARD_UID!;
    const identity = await remote.get('/api/user');
    expect(identity.login).toBe(process.env.AI_TEST_USER);
    const before = await remote.get(`/api/dashboards/uid/${encodeURIComponent(uid)}`);
    // Abort before any attempted save if the test account unexpectedly has Edit.
    expect(before.meta.canSave).toBe(false);
    const client = new SessionToolClient();
    await expect(client.callTool({ name: 'get_dashboard_creation_access', arguments: {} })).resolves.toEqual({ allowed: false });
    await expect(client.callTool({ name: 'update_dashboard', arguments: { dashboard: before.dashboard, userId: 1, isAdmin: true, overwrite: true } })).rejects.toMatchObject({ status: 403 });
    // Same, unchanged content: verifies Grafana's actual server boundary without
    // attempting to delete content even if the server unexpectedly grants access.
    await expect(remote.post('/api/dashboards/db', { dashboard: before.dashboard, folderUid: before.meta.folderUid || '', overwrite: true })).rejects.toMatchObject({ status: 403 });
    const after = await remote.get(`/api/dashboards/uid/${encodeURIComponent(uid)}`);
    expect(after.dashboard.version).toBe(before.dashboard.version);
    expect(after.dashboard.panels).toEqual(before.dashboard.panels);
  }, 60000);
});
