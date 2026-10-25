import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock('../src/agent', () => ({ runAgent: mock.run }));
import { beginRun, getRun, endRunIfIdle } from '../src/runStore';
import { loadSavedState, setStorageIdentity } from '../src/storage';
import { PlanExecution } from '../src/planning';
beforeEach(() => {
  setStorageIdentity(1, 1);
  vi.resetAllMocks(); endRunIfIdle();
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v) });
});
it('persists the first conversation and completed checklist even for a fast provider', async () => {
  mock.run.mockImplementation(async (_h, _c, _s, onText, _a, _e, progress) => {
    const plan = new PlanExecution(progress); plan.finish('request', 'Answered'); onText('Done');
  });
  beginRun({ conversationId: 'new', messages: [{ role: 'user', content: 'Explain queries' }], context: '{"notes":"service=api","timeWindow":"Last 6 hours"}', effort: 'off' });
  await vi.waitFor(() => expect(getRun()?.running).toBe(false));
  const saved = loadSavedState().conversations[0];
  expect(saved.context).toBe('service=api');
  expect(saved.messages.at(-1)?.plan?.steps[0].status).toBe('completed');
  expect(saved.messages.at(-1)?.content).toBe('Done');
});
it('retains checkpoint evidence after an upstream failure', async () => {
  mock.run.mockImplementation(async (_h, _c, _s, _t, _a, _e, progress) => {
    const plan = new PlanExecution(progress); plan.beginAction('read', 'search_dashboards'); plan.endAction('read'); plan.interrupt('Provider timeout');
    throw new Error('Provider timeout');
  });
  beginRun({ conversationId: 'new', messages: [{ role: 'user', content: 'Investigate' }], context: '', effort: 'off' });
  await vi.waitFor(() => expect(getRun()?.running).toBe(false));
  const last = loadSavedState().conversations[0].messages.at(-1)!;
  expect(last.plan?.actions[0].status).toBe('completed');
  expect(last.plan?.steps[0].status).toBe('failed');
  expect(last.content).toContain('Provider timeout');
});
it('persists attached dashboard context without storing an object in the range selector', async () => {
  mock.run.mockImplementation(async (_h, _c, _s, onText) => onText('Done'));
  beginRun({ conversationId: 'dashboard', messages: [{ role: 'user', content: 'Explain this panel' }], context: JSON.stringify({ timeWindow: { from: 'now-15m', to: 'now' }, dashboard: { dashboardUid: 'cluster', from: 'now-15m', to: 'now', variables: {}, capturedAt: 'now' } }), effort: 'off' });
  await vi.waitFor(() => expect(getRun()?.running).toBe(false));
  expect(loadSavedState().conversations[0]).toMatchObject({ range: 'Dashboard time range', viewContext: { dashboardUid: 'cluster' } });
});
it('passes the selected datasource to the agent and persists it alongside dashboard context', async () => {
  mock.run.mockImplementation(async (_h, _c, _s, onText) => onText('Done'));
  const datasource = { uid: 'metrics-prod', name: 'Metrics', type: 'prometheus' };
  const context = JSON.stringify({ datasource, dashboard: { dashboardUid: 'cluster', variables: {}, capturedAt: 'now' } });
  beginRun({ conversationId: 'source', messages: [{ role: 'user', content: 'Use this source' }], context, effort: 'off' });
  await vi.waitFor(() => expect(getRun()?.running).toBe(false));
  expect(mock.run.mock.calls[0][1]).toBe(context);
  expect(loadSavedState().conversations[0]).toMatchObject({ datasource, viewContext: { dashboardUid: 'cluster' } });
});
it('persists the copy offer so its action survives reopening the conversation', async () => {
  const copyOffer = { sourceUid: 'source', sourceTitle: 'Read-only', request: 'Remove panel 1' };
  mock.run.mockImplementation(async (_h, _c, _s, onText) => onText('You can create a modified copy.', undefined, [], copyOffer));
  beginRun({ conversationId: 'offer', messages: [{ role: 'user', content: 'Remove panel 1' }], context: '{}', effort: 'off' });
  await vi.waitFor(() => expect(getRun()?.running).toBe(false));
  expect(loadSavedState().conversations[0].messages.at(-1)?.copyOffer).toEqual(copyOffer);
});
