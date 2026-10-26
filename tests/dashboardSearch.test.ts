import { describe, expect, it, vi } from 'vitest';
import { dashboardMention, findDashboards, selectedDashboard } from '../src/dashboardSearch';

describe('dashboard attachment', () => {
  it('recognizes mentions at the cursor without treating email addresses as triggers', () => {
    expect(dashboardMention('Investigate @Cluster CPU please', 24)).toEqual({ start: 12, end: 24, query: 'Cluster CPU' });
    expect(dashboardMention('@', 1)).toEqual({ start: 0, end: 1, query: '' });
    expect(dashboardMention('a@example.com', 13)).toBeUndefined();
    expect(dashboardMention('@CPU\nexplain', 12)).toBeUndefined();
  });
  it('searches permission-filtered dashboard pages and preserves duplicate names by UID', async () => {
    const get = vi.fn().mockResolvedValue([{ uid: 'a', title: 'CPU', folderTitle: 'Prod' }, { uid: 'b', title: 'CPU', folderTitle: 'Dev' }, { title: 'Invalid' }]);
    const result = await findDashboards('CPU', 2, get);
    expect(get).toHaveBeenCalledWith('/api/search', { type: 'dash-db', query: 'CPU', limit: 100, page: 2 });
    expect(result.map(d => d.uid)).toEqual(['a', 'b']);
    expect(selectedDashboard(result[1]).from).toBeUndefined();
    expect(selectedDashboard(result[1])).toMatchObject({ dashboardUid: 'b', dashboardTitle: 'CPU', variables: {} });
  });
  it('surfaces search errors rather than presenting a misleading empty result', async () => {
    await expect(findDashboards('', 1, async () => { throw new Error('Forbidden'); })).rejects.toThrow('Forbidden');
  });
});
