import { expect, it, vi } from 'vitest';
import { dashboardCreationAccess } from '../src/creationDestinations';
it('resolves folder names and returns every explicitly granted destination in stable order', async () => {
  const get = vi.fn(async (url: string) => url.includes('permissions') ? { 'dashboards:create': ['folders:uid:z', 'folders:uid:a'] } : { title: url.endsWith('/z') ? 'Users' : 'Personal' });
  expect(await dashboardCreationAccess({ get: get as any })).toEqual({ allowed: true, folderUid: 'a', folderTitle: 'Personal', destinations: [{ uid: 'a', title: 'Personal' }, { uid: 'z', title: 'Users' }] });
});
it('lists all folder pages for a wildcard grant without imposing a result limit', async () => {
  const get = vi.fn(async (url: string, params?: any) => {
    if (url.includes('permissions')) return { 'dashboards:create': ['folders:*'] };
    return params.page === 1 ? Array.from({ length: 100 }, (_, n) => ({ uid: 'f' + n, title: 'Folder ' + n })) : [{ uid: 'last', title: 'Last' }];
  });
  const result = await dashboardCreationAccess({ get: get as any });
  expect(result.destinations).toHaveLength(102);
  expect(result.destinations).toContainEqual({ uid: 'last', title: 'Last' });
});
it('rechecks the selected destination without silently selecting another permitted folder', async () => {
  const get = vi.fn(async () => ({ 'dashboards:create': ['folders:uid:other'] }));
  expect(await dashboardCreationAccess({ get: get as any }, 'chosen')).toEqual({ allowed: false, folderUid: 'chosen' });
});
