export interface DatasourceContext { uid: string; name: string; type: string }
export function datasourceContext(value: unknown): DatasourceContext | undefined {
  const item = value as Record<string, unknown> | null;
  if (!item || typeof item.uid !== 'string' || !item.uid || typeof item.name !== 'string' || typeof item.type !== 'string') return;
  // Never include connection URLs, credentials, jsonData or secureJsonFields.
  return { uid: item.uid, name: item.name, type: item.type };
}
export function matchingDatasources(items: DatasourceContext[], query: string): DatasourceContext[] {
  const search = query.trim().toLocaleLowerCase();
  return items.filter(d => `${d.name} ${d.type} ${d.uid}`.toLocaleLowerCase().includes(search));
}
