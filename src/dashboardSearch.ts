import type { DashboardContext } from './dashboardContext';

export interface DashboardChoice { uid: string; title: string; folderTitle?: string }
export function dashboardMention(text: string, cursor: number): { start: number; end: number; query: string } | undefined {
  const before = text.slice(0, cursor);
  const match = before.match(/(?:^|\s)@([^@\n]*)$/);
  if (!match) return;
  return { start: cursor - match[1].length - 1, end: cursor, query: match[1] };
}
export function selectedDashboard(choice: DashboardChoice): DashboardContext {
  return { dashboardUid: choice.uid, dashboardTitle: choice.title, variables: {}, capturedAt: new Date().toISOString() };
}
// Search uses Grafana's own permission-filtered API. Fetch pages so duplicate titles
// remain selectable; the UID, never the display name, identifies the attachment.
export async function findDashboards(query: string, page: number, get: (url: string, params: Record<string, unknown>) => Promise<DashboardChoice[]>): Promise<DashboardChoice[]> {
  return (await get('/api/search', { type: 'dash-db', query, limit: 100, page })).filter(d => d.uid && d.title);
}
