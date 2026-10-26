import { describe, expect, it, vi } from 'vitest';
import { PlanExecution, validateSteps } from '../src/planning';
import { queryEvidence, verifyDashboard, preservedPanels, mergeDashboardEdit, applyDashboardPatch } from '../src/evidence';
const steps = [
  { id: 'inspect', description: 'Inspect datasource', kind: 'inspect', dependsOn: [] },
  { id: 'write', description: 'Build dashboard', kind: 'write', dependsOn: ['inspect'] },
];
describe('execution plans', () => {
  it('rejects duplicate IDs, missing dependencies and cycles', () => {
    expect(() => validateSteps([steps[0], steps[0]])).toThrow('unique');
    expect(() => validateSteps([steps[1]])).toThrow('Unknown dependency');
    expect(() => validateSteps([{ ...steps[0], dependsOn: ['write'] }, steps[1]])).toThrow('cycle');
    expect(validateSteps(steps).map(s => s.status)).toEqual(['pending', 'pending']);
  });
  it('ignores model-supplied completion claims and enforces dependencies and evidence', () => {
    const execution = new PlanExecution(vi.fn());
    execution.revise('Build', steps.map(s => ({ ...s, status: 'completed' })));
    expect(() => execution.start('write')).toThrow('Prerequisites');
    execution.start('inspect');
    expect(() => execution.finish('inspect', 'Done')).toThrow('no execution');
    execution.beginAction('a', 'list_datasources'); execution.endAction('a'); execution.finish('inspect', 'Found datasource');
    execution.start('write'); expect(execution.current()?.id).toBe('write');
  });
  it('keeps failures visible and blocks downstream writes', () => {
    const execution = new PlanExecution(vi.fn()); execution.revise('Build', steps); execution.start('inspect');
    execution.beginAction('a', 'list_datasources'); execution.endAction('a', 'Denied');
    expect(() => execution.finish('inspect', 'Done')).toThrow('Failed');
    execution.fail('inspect', 'Denied');
    expect(execution.state.steps.map(s => s.status)).toEqual(['failed', 'blocked']);
    expect(() => execution.start('write')).toThrow();
  });
  it('preserves executed steps on revisions and publishes immutable snapshots', () => {
    const publish = vi.fn(); const execution = new PlanExecution(publish); execution.revise('Build', steps);
    execution.start('inspect'); execution.beginAction('a', 'list_datasources');
    const snapshot = publish.mock.calls.at(-1)![0]; execution.endAction('a');
    expect(snapshot.actions[0].status).toBe('running');
    expect(() => execution.revise('Changed', [{ ...steps[0], description: 'Something else' }, steps[1]])).toThrow('executed');
  });
  it('does not allow a query step to finish on discovery alone', () => {
    const execution = new PlanExecution(vi.fn()); execution.revise('Query', [{ ...steps[0], kind: 'query' }]); execution.start('inspect');
    execution.beginAction('a', 'list_metrics'); execution.endAction('a');
    expect(() => execution.finish('inspect', 'Done')).toThrow('No successful query');
  });
});
describe('execution evidence', () => {
  it('distinguishes empty data, errors, and unknown result shapes without guessing', () => {
    const args = { datasourceUid: 'source', expr: 'up', start: 'now-1h', end: 'now' };
    expect(queryEvidence('query_metrics', args, { data: { result: [] } }, false)).toMatchObject({ expression: 'up', datasource: 'source', range: { start: 'now-1h', end: 'now' }, data: 'empty', status: 'success' });
    expect(queryEvidence('query_metrics', args, undefined, true)).toMatchObject({ data: 'unknown', status: 'error' });
    expect(queryEvidence('query_metrics', args, { content: [{ type: 'text', text: 'some output' }] }, false)?.data).toBe('unknown');
    expect(queryEvidence('query_metrics', args, { data: { result: [1] } }, false)?.data).toBe('present');
  });
  it('detects missing panels and mismatched queries or datasources in read-back', () => {
    const expected = { title: 'Cluster', panels: [{ id: 1, title: 'CPU', datasource: { uid: 'p' }, targets: [{ expr: 'cpu', refId: 'A' }] }] };
    expect(verifyDashboard(expected, { ...expected, version: 4 })).toEqual([]);
    expect(verifyDashboard(expected, { title: 'Cluster', panels: [] })).toEqual(expect.arrayContaining(['Missing panel: CPU']));
    expect(verifyDashboard(expected, { title: 'Cluster', panels: [{ ...expected.panels[0], targets: [{ expr: 'wrong', refId: 'A' }] }] })).toContain('Panel CPU: targets differs.');
    expect(preservedPanels(expected, { panels: [] })).toBe(false);
  });
});

it('preserves unrelated dashboard settings and panels during partial edits', () => {
  const original = { uid: 'a', tags: ['ops'], panels: [{ id: 1, title: 'CPU', options: { legend: true } }, { id: 2, title: 'Memory' }] };
  const merged = mergeDashboardEdit(original, { panels: [{ id: 1, title: 'CPU updated' }] }, false);
  expect(merged.tags).toEqual(['ops']); expect(merged.panels).toHaveLength(2);
  expect(merged.panels[0].options).toEqual({ legend: true });
  expect(mergeDashboardEdit(original, { panels: [] }, true).panels).toEqual([]);
});
it('skips an inapplicable step without allowing dependent writes', () => {
  const execution = new PlanExecution(vi.fn()); execution.revise('Build', steps);
  execution.skip('inspect', 'Datasource unavailable');
  expect(execution.state.steps.map(s => s.status)).toEqual(['skipped', 'blocked']);
  expect(() => execution.start('write')).toThrow();
});
it('recognizes a verified repair of the same dashboard while preserving failed tool history', () => {
  const execution = new PlanExecution(vi.fn());
  const failed = { id: 'write', kind: 'write', description: 'Create dashboard', dependsOn: [] };
  const repair = { id: 'repair', kind: 'write', description: 'Repair dashboard', dependsOn: [] };
  execution.revise('Create', [failed]); execution.start('write'); execution.beginAction('bad', 'update_dashboard');
  execution.state.actions[0].subject = 'dashboard-title:test'; execution.endAction('bad', 'Unsupported schema'); execution.fail('write', 'Unsupported schema');
  execution.revise('Repair', [failed, repair]); execution.start('repair'); execution.beginAction('good', 'update_dashboard');
  execution.state.actions[1].subject = 'dashboard-title:test'; execution.endAction('good');
  execution.state.dashboards.push({ uid: 'test', status: 'verified', detail: 'Read-back matches', at: Date.now() });
  execution.finish('repair', 'Repaired and verified');
  expect(execution.state.steps[0]).toMatchObject({ status: 'failed', resolvedBy: 'repair' });
  expect(execution.state.actions[0].status).toBe('failed');
});

it('derives the expected dashboard for JSONPath and JSON Pointer updates without changing the original', () => {
  const original = { uid: 'target', tags: ['ops'], panels: [{ id: 1, title: 'Original', options: { content: 'Keep me' } }] };
  const expected = applyDashboardPatch(original, [
    { op: 'add', path: '$.panels/- ', value: { id: 2, title: 'New' } },
    { op: 'replace', path: '$.panels[1].title', value: 'Added' },
    { op: 'replace', path: '/panels/1/title', value: 'Final title' },
  ]);
  expect(expected.panels).toHaveLength(2); expect(original.panels).toHaveLength(1);
  expect(expected.tags).toEqual(['ops']);
  expect(verifyDashboard(expected, { ...expected, tags: ['wrong'] })).toContain('Saved dashboard tags differs.');
  expect(() => applyDashboardPatch(original, [{ op: 'add', path: '$.panels[*]', value: {} }])).toThrow('Unsupported');
  expect(() => applyDashboardPatch(original, [{ op: 'add', path: '/__proto__/polluted', value: true }])).toThrow('Unsafe');
  expect(() => applyDashboardPatch(original, [{ op: 'replace', path: '/uid', value: 'other' }])).toThrow('target');
});

it('completes a diagnostic comparison with an acknowledged failing query and a successful control', () => {
  const execution = new PlanExecution(vi.fn());
  execution.revise('Compare', [{ id: 'compare', description: 'Compare All and selected instance', kind: 'query', dependsOn: [] }, { id: 'repair', description: 'Repair shared formatter', kind: 'write', dependsOn: ['compare'] }]);
  execution.beginAction('all', 'query_prometheus'); execution.endAction('all');
  execution.state.queries.push({ ...queryEvidence('query_prometheus', { query: 'up' }, { data: { result: [1] } }, false)!, actionId: 'all', stepId: 'compare' });
  execution.beginAction('selected', 'query_prometheus'); execution.endAction('selected', 'Unknown escape sequence');
  execution.state.queries.push({ ...queryEvidence('query_prometheus', { query: 'bad' }, undefined, true)!, actionId: 'selected', stepId: 'compare' });
  expect(() => execution.finish('compare', 'Reproduced')).toThrow('Failed');
  execution.finish('compare', 'Selected instance reproduced the parse error; control succeeded', ['selected']);
  expect(execution.state.actions[1]).toMatchObject({ status: 'failed', expectedFailure: true });
  execution.start('repair'); expect(execution.current()?.id).toBe('repair');
});
it('does not excuse failed writes, unknown actions, or missing successful controls', () => {
  const execution = new PlanExecution(vi.fn());
  execution.revise('Compare', [{ id: 'compare', description: 'Compare', kind: 'query', dependsOn: [] }]);
  execution.beginAction('bad', 'query_prometheus'); execution.endAction('bad', 'Parse error');
  execution.state.queries.push({ ...queryEvidence('query_prometheus', { query: 'bad' }, undefined, true)!, actionId: 'bad', stepId: 'compare' });
  expect(() => execution.finish('compare', 'Done', ['unknown'])).toThrow('Only recorded');
  expect(() => execution.finish('compare', 'Done', ['bad'])).toThrow('No successful');
  execution.beginAction('write', 'update_dashboard'); execution.endAction('write', 'Save rejected');
  expect(() => execution.finish('compare', 'Done', ['bad', 'write'])).toThrow('Only recorded');
  expect(execution.state.actions[0].expectedFailure).toBeUndefined();
});
