import { describe, expect, it } from 'vitest';
import { verifyDashboard, queryEvidence } from '../src/evidence';
describe('saved dashboard removal verification', () => {
  const retained = { id: 2, title: 'CPU', type: 'stat', targets: [{ expr: 'up' }], transformations: [{ id: 'reduce' }] };
  it('rejects a removed panel that is still present, including nested rows', () => {
    const expected = { panels: [{ id: 1, panels: [retained] }] };
    const actual = { panels: [{ id: 1, panels: [retained, { id: 7, title: 'Average uptime' }] }] };
    expect(verifyDashboard(expected, actual)).toContain('Unexpected panel remains: Average uptime');
  });
  it('accepts a verified removal including the final panel', () => {
    expect(verifyDashboard({ panels: [retained] }, { panels: [retained], version: 3 })).toEqual([]);
    expect(verifyDashboard({ panels: [] }, { panels: [] })).toEqual([]);
    expect(verifyDashboard({ panels: [] }, { panels: [{ id: 7 }] })).not.toEqual([]);
  });
  it('detects unrelated panel changes and extra queries in retained panels', () => {
    expect(verifyDashboard({ panels: [retained] }, { panels: [{ ...retained, transformations: [] }] })).not.toEqual([]);
    expect(verifyDashboard({ panels: [retained] }, { panels: [{ ...retained, targets: [...retained.targets, { expr: 'unrequested' }] }] })).not.toEqual([]);
  });
});

it('records native SQL queries and distinguishes rows from empty results', () => {
  const args = { datasourceUid: 'sql', query: { rawSql: 'SELECT 1' }, from: 'now-5m', to: 'now' };
  expect(queryEvidence('query_datasource', args, { results: { A: { frames: [{ data: { values: [[1]] } }] } } }, false)).toMatchObject({ expression: 'SELECT 1', datasource: 'sql', data: 'present', status: 'success' });
  expect(queryEvidence('query_datasource', args, { results: { A: { frames: [] } } }, false)).toMatchObject({ data: 'empty' });
  expect(queryEvidence('query_datasource', args, undefined, true)).toMatchObject({ data: 'unknown', status: 'error' });
});
