export type CopyDestination = { uid: string; title: string };
type Api = { get<T = any>(url: string, params?: any): Promise<T> };
export async function dashboardCreationAccess(api: Api, folderUid?: string) {
  const permissions = await api.get<Record<string, string[]>>('/api/access-control/user/permissions');
  const scopes = [...(permissions['dashboards:create'] || []), ...(permissions['dashboards:write'] || [])];
  const all = scopes.some(scope => ['*', 'folders:*', 'folders:uid:*'].includes(scope));
  const allowed = (uid: string) => all || scopes.includes('folders:uid:' + (uid || 'general'));
  const title = async (uid: string) => {
    if (!uid) return 'General';
    try { return String((await api.get(`/api/folders/${encodeURIComponent(uid)}`)).title || uid); }
    catch { return uid; } // Creation may be allowed even when folder metadata is unavailable.
  };
  if (folderUid !== undefined) {
    if (!allowed(folderUid)) return { allowed: false, folderUid };
    return { allowed: true, folderUid, folderTitle: await title(folderUid) };
  }
  const ids = new Set(scopes.filter(scope => /^folders:uid:[a-zA-Z0-9_-]+$/.test(scope)).map(scope => scope.slice('folders:uid:'.length)).map(uid => uid === 'general' ? '' : uid));
  if (all) ids.add('');
  const destinations: CopyDestination[] = await Promise.all([...ids].map(async uid => ({ uid, title: await title(uid) })));
  if (all) {
    // The search API is permission-filtered. Read every page rather than imposing a folder cap.
    for (let page = 1; ; page++) {
      let found: any[];
      try { found = await api.get('/api/search', { type: 'dash-folder', limit: 100, page }); }
      catch { break; }
      if (!Array.isArray(found)) break;
      let added = 0;
      for (const folder of found) if (typeof folder.uid === 'string' && !destinations.some(item => item.uid === folder.uid)) {
        destinations.push({ uid: folder.uid, title: String(folder.title || folder.uid) }); added++;
      }
      if (found.length < 100 || added === 0) break;
    }
  }
  destinations.sort((a, b) => a.title.localeCompare(b.title) || a.uid.localeCompare(b.uid));
  const first = destinations[0];
  return first ? { allowed: true, folderUid: first.uid, folderTitle: first.title, destinations } : { allowed: false };
}
