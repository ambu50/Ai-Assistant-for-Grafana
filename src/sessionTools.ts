import { dashboardCreationAccess } from './creationDestinations';
import { getBackendSrv } from '@grafana/runtime';
import { applyDashboardPatch } from './evidence';

const string = { type: 'string' };
const source = { datasourceUid: string };
const operations = { type: 'array', minItems: 1, description: 'JSON Patch array relative to the dashboard model, e.g. [{"op":"remove","path":"/panels/5"}]. Paths must start with / or $.; no dashboard prefix.', items: { type: 'object', properties: { op: { type: 'string', enum: ['add', 'replace', 'remove'] }, path: { type: 'string', description: 'JSON Pointer such as /panels/5 or /panels, relative to the dashboard model.' }, value: {} }, required: ['op', 'path'], additionalProperties: false } };
const definition = (name: string, description: string, properties: Record<string, object>, required: string[] = []) => ({ name, description, inputSchema: { type: 'object' as const, properties, required, additionalProperties: false } });
export const sessionTools = [
  definition('get_dashboard_creation_access', 'Check the signed-in user dashboard creation permissions and resolve a permitted destination folder before offering or planning a copy.', { folderUid: string }, []),
  definition('search_dashboards', 'Search dashboards accessible to the signed-in user.', { query: string, page: { type: 'number' } }),
  definition('get_dashboard_by_uid', 'Read a dashboard using the signed-in user permissions.', { uid: string }, ['uid']),
  definition('list_datasources', 'List datasource identities accessible to the signed-in user.', {}),
  definition('get_datasource_by_uid', 'Read a datasource identity as the signed-in user.', { uid: string }, ['uid']),
  definition('update_dashboard', 'Create or update a classic dashboard, or apply patch operations to an existing dashboard. Grafana enforces the signed-in user permissions on the actual save. Preserve unrelated content.', { uid: string, dashboard: { type: 'object', additionalProperties: true }, operations, folderUid: string, message: string, overwrite: { type: 'boolean' } }),
  definition('create_dashboard_copy', 'Create a new modified copy of a readable dashboard after a copy request or acceptance of a pending copy offer. To remove panels, prefer removePanelIds; it handles nested row panels using the full source without model truncation. Make the modified copy in one save rather than a plain copy followed by edits. Never edit or overwrite the source. Destination creation permissions are enforced by Grafana.', { sourceUid: string, title: string, operations, removePanelIds: { type: 'array', minItems: 1, items: { type: 'integer' }, description: 'Exact panel IDs to remove recursively from the source. Mutually exclusive with operations. All other content is preserved.' }, folderUid: string }, ['sourceUid']),
  definition('query_prometheus', 'Run a PromQL query through Grafana as the signed-in user.', { ...source, expr: string, queryType: { type: 'string', enum: ['instant', 'range'] }, startTime: string, endTime: string, stepSeconds: { type: 'number' } }, ['datasourceUid', 'expr']),
  definition('list_prometheus_label_values', 'Read Prometheus label values using the signed-in user permissions.', { ...source, labelName: string }, ['datasourceUid', 'labelName']),
  definition('list_prometheus_label_names', 'Read Prometheus label names using the signed-in user permissions.', source, ['datasourceUid']),
];
function identifier(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error(`A valid ${label} is required.`);
  return value;
}
function time(value: unknown): number {
  if (typeof value !== 'string' || !value) throw new Error('A query time is required.');
  if (value === 'now') return Date.now() / 1000;
  const relative = /^now-(\d+)(s|m|h|d|w)$/.exec(value);
  if (relative) return Date.now() / 1000 - Number(relative[1]) * ({ s: 1, m: 60, h: 3600, d: 86400, w: 604800 }[relative[2]]!);
  const result = /^\d+(\.\d+)?$/.test(value) ? Number(value) : Date.parse(value) / 1000;
  if (!Number.isFinite(result)) throw new Error('Invalid query time.');
  return result;
}
// There is deliberately no arbitrary URL, Authorization header, token, MCP
// transport or service-account fallback in this dispatcher. Grafana checks the
// session identity again on every native API request, including the final POST.
export class SessionToolClient {
  async listTools() { return { tools: sessionTools }; }
  async close() {}
  async callTool({ name, arguments: args }: { name: string; arguments: Record<string, unknown> }): Promise<unknown> {
    const api = getBackendSrv();
    const identity = (d: any) => ({ uid: d.uid, name: d.name, type: d.type });
    switch (name) {
      case 'get_dashboard_creation_access': return dashboardCreationAccess(api, typeof args.folderUid === 'string' ? args.folderUid : undefined);
      case 'search_dashboards': return api.get('/api/search', { type: 'dash-db', query: String(args.query || ''), page: Number(args.page) || 1, limit: 100 });
      case 'get_dashboard_by_uid': return api.get(`/api/dashboards/uid/${identifier(args.uid, 'dashboard UID')}`);
      case 'list_datasources': return (await api.get<any[]>('/api/datasources')).map(identity);
      case 'get_datasource_by_uid': return identity(await api.get(`/api/datasources/uid/${identifier(args.uid, 'datasource UID')}`));
      case 'create_dashboard_copy': {
        const sourceUid = identifier(args.sourceUid, 'source dashboard UID');
        const original = await api.get(`/api/dashboards/uid/${sourceUid}`);
        if (!original.dashboard || !Array.isArray(original.dashboard.panels)) throw new Error('No readable classic dashboard was returned.');
        const dashboard = args.operations !== undefined ? applyDashboardPatch(original.dashboard, args.operations) : JSON.parse(JSON.stringify(original.dashboard));
        if (args.removePanelIds !== undefined) {
          if (args.operations !== undefined) throw new Error('Choose removePanelIds or operations, not both.');
          if (!Array.isArray(args.removePanelIds) || !args.removePanelIds.length || !args.removePanelIds.every(Number.isInteger)) throw new Error('removePanelIds requires a non-empty array of integer panel IDs.');
          const wanted = new Set(args.removePanelIds);
          const found = new Set<number>();
          const remove = (panels: any[]): any[] => panels.filter(panel => {
            if (wanted.has(panel.id)) { found.add(panel.id); return false; }
            if (Array.isArray(panel.panels)) panel.panels = remove(panel.panels);
            return true;
          });
          dashboard.panels = remove(dashboard.panels);
          if ([...wanted].some(id => !found.has(id as number))) throw new Error('A requested panel ID was not found in the source; no copy was created.');
        }
        dashboard.id = null; dashboard.uid = null; dashboard.version = 0;
        dashboard.title = typeof args.title === 'string' && args.title.trim() ? args.title.trim() : `${original.dashboard.title} (copy)`;
        const saved = await api.post('/api/dashboards/db', { dashboard, ...(args.folderUid !== undefined ? { folderUid: args.folderUid } : {}), overwrite: false, message: 'AI Assistant: create modified dashboard copy' });
        if (!saved.uid || saved.uid === sourceUid) throw new Error('The server did not return a distinct copy UID.');
        return { ...saved, title: dashboard.title, expectedDashboard: dashboard };
      }
      case 'update_dashboard': {
        let dashboard: any = args.dashboard;
        let folderUid = args.folderUid;
        if (args.operations !== undefined) {
          if (dashboard) throw new Error('Choose a dashboard or operations, not both.');
          const existing = await api.get(`/api/dashboards/uid/${identifier(args.uid, 'dashboard UID')}`);
          if (existing.meta?.canSave !== true) throw Object.assign(new Error('Permission denied: you cannot save this dashboard.'), { status: 403 });
          dashboard = applyDashboardPatch(existing.dashboard, args.operations);
          folderUid ??= existing.meta?.folderUid;
        }
        if (!dashboard || typeof dashboard !== 'object' || Array.isArray(dashboard)) throw new Error('A structured dashboard is required.');
        if (args.uid && dashboard.uid !== args.uid) throw new Error('Dashboard UID differs from the requested target.');
        if (dashboard.uid && args.operations === undefined) {
          const uid = identifier(dashboard.uid, 'dashboard UID');
          try {
            const existing = await api.get(`/api/dashboards/uid/${uid}`);
            if (existing.meta?.canSave !== true) throw Object.assign(new Error('Permission denied: you cannot save this dashboard.'), { status: 403 });
            folderUid ??= existing.meta?.folderUid;
          } catch (error) {
            if ((error as { status?: number })?.status !== 404) throw error;
            // A new UID is still authorized by Grafana on the final save.
          }
        }
        // No trust is placed in model-supplied canEdit/canSave, user IDs or roles.
        // POST /api/dashboards/db is the server-side authorization boundary.
        return api.post('/api/dashboards/db', { dashboard, ...(folderUid !== undefined ? { folderUid } : {}), overwrite: args.overwrite === true, message: typeof args.message === 'string' ? args.message : 'AI Assistant dashboard update' });
      }
      case 'query_prometheus': {
        const uid = identifier(args.datasourceUid, 'datasource UID');
        if (typeof args.expr !== 'string' || !args.expr.trim()) throw new Error('A PromQL expression is required.');
        const range = args.queryType === 'range';
        const params = range ? { query: args.expr, start: time(args.startTime), end: time(args.endTime), step: Number(args.stepSeconds) || 60 } : { query: args.expr };
        return api.get(`/api/datasources/proxy/uid/${uid}/api/v1/${range ? 'query_range' : 'query'}`, params);
      }
      case 'list_prometheus_label_values': return api.get(`/api/datasources/proxy/uid/${identifier(args.datasourceUid, 'datasource UID')}/api/v1/label/${identifier(args.labelName, 'label name')}/values`);
      case 'list_prometheus_label_names': return api.get(`/api/datasources/proxy/uid/${identifier(args.datasourceUid, 'datasource UID')}/api/v1/labels`);
      default: throw new Error('Tool is not supported by the session-authenticated dispatcher.');
    }
  }
}
