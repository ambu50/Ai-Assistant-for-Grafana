import type { QueryEvidence } from './planning';

export function unwrapResult(output: unknown): any {
  const record = output as any;
  if (record?.isError) throw new Error(Array.isArray(record.content) ? record.content.map((c: any) => c.text || '').join('\n') || 'Tool reported an error.' : 'Tool reported an error.');
  if (record?.structuredContent) return record.structuredContent;
  if (Array.isArray(record?.content)) {
    const text = record.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n');
    try { return JSON.parse(text); } catch { return text; }
  }
  return output;
}
export function queryEvidence(name: string, args: Record<string, unknown>, output: unknown, failed: boolean): QueryEvidence | undefined {
  const expr = args.expr ?? args.query ?? args.expression ?? args.promql ?? args.logql;
  if (!/query/i.test(name) || typeof expr !== 'string') return;
  let data: QueryEvidence['data'] = 'unknown';
  if (!failed) {
    const result = unwrapResult(output);
    const values = result?.data?.result ?? result?.result ?? (Array.isArray(result) ? result : undefined);
    if (Array.isArray(values)) data = values.length ? 'present' : 'empty';
  }
  const range = Object.fromEntries(Object.entries(args).filter(([key]) => /^(start|end|from|to|time|step|range|timeRange)$/i.test(key)));
  return { tool: name, datasource: String(args.datasourceUid ?? args.datasource_uid ?? args.datasource ?? ''), expression: expr, range, status: failed ? 'error' : 'success', data, at: Date.now() };
}
export function dashboardModel(value: any): any {
  return value?.dashboard ?? value;
}
function panels(model: any): any[] {
  if (Array.isArray(model?.panels)) return model.panels.flatMap((p: any) => [p, ...panels(p)]);
  if (model?.elements && typeof model.elements === 'object') return Object.values(model.elements).map((e: any) => e?.spec ?? e);
  return [];
}
function contains(actual: any, expected: any): boolean {
  if (expected === null || typeof expected !== 'object') return actual === expected;
  if (actual === null || typeof actual !== 'object') return false;
  if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length && expected.every((item, i) => contains(actual[i], item));
  return Object.entries(expected).every(([key, value]) => contains(actual[key], value));
}
export function verifyDashboard(expected: any, actual: any): string[] {
  expected = dashboardModel(expected); actual = dashboardModel(actual);
  if (!actual || typeof actual !== 'object') return ['Dashboard read-back returned no structured dashboard.'];
  const gaps: string[] = [];
  for (const key of ['title', 'description', 'tags', 'templating', 'annotations', 'time', 'refresh', 'timezone', 'timepicker', 'links']) {
    if (expected?.[key] !== undefined && !contains(actual[key], expected[key])) gaps.push(`Saved dashboard ${key} differs.`);
  }
  if (Array.isArray(expected?.panels)) {
    for (const actualPanel of panels(actual)) {
      if (!panels(expected).some(p => p.id !== undefined ? p.id === actualPanel.id : p.title === actualPanel.title)) gaps.push(`Unexpected panel remains: ${actualPanel.title ?? actualPanel.id}`);
    }
    if (panels(actual).length !== panels(expected).length) gaps.push('Saved panel count differs.');
  }
  for (const p of panels(expected)) {
    const found = panels(actual).find(a => p.id !== undefined ? a.id === p.id : a.title === p.title);
    if (!found) { gaps.push(`Missing panel: ${p.title ?? p.id}`); continue; }
    for (const key of Object.keys(p)) {
      if (p[key] !== undefined && !contains(found[key], p[key])) gaps.push(`Panel ${p.title ?? p.id}: ${key} differs.`);
    }
  }
  if (expected?.elements && !contains(actual.elements, expected.elements)) gaps.push('Saved dashboard elements differ.');
  return gaps;
}
export function preservedPanels(original: any, proposed: any): boolean {
  return panels(dashboardModel(original)).every(old => panels(dashboardModel(proposed)).some(p => old.id !== undefined ? p.id === old.id : p.title === old.title));
}

export function mergeDashboardEdit(original: any, proposed: any, allowRemoval: boolean): any {
  const result = { ...original, ...proposed };
  if (!allowRemoval && Array.isArray(original?.panels) && Array.isArray(proposed?.panels)) {
    const same = (a: any, b: any) => a.id !== undefined && b.id !== undefined ? a.id === b.id : a.title === b.title;
    result.panels = original.panels.map((old: any) => {
      const change = proposed.panels.find((p: any) => same(old, p));
      return change ? mergeDashboardEdit(old, change, false) : old;
    });
    result.panels.push(...proposed.panels.filter((p: any) => !original.panels.some((old: any) => same(old, p))));
  }
  return result;
}

/** Apply the simple JSONPath/JSON Pointer patches exposed by the Grafana MCP tool.
 * Unsupported selectors are rejected before dispatch instead of guessing a post-write contract.
 */
export function applyDashboardPatch(original: any, operations: unknown): any {
  if (!Array.isArray(operations) || !operations.length) throw new Error('Patch operations must be a non-empty array.');
  const result = JSON.parse(JSON.stringify(original));
  for (const op of operations) {
    if (!op || typeof op.path !== 'string' || !['add', 'replace', 'remove'].includes(op.op)) throw new Error('Use add, replace, or remove patches, or submit a full dashboard for verification.');
    if (op.op !== 'remove' && !Object.prototype.hasOwnProperty.call(op, 'value')) throw new Error('Patch value is required.');
    const path = op.path.trim();
    let keys: string[];
    if (path.startsWith('/')) keys = path.slice(1).split('/').map((key: string) => key.replace(/~1/g, '/').replace(/~0/g, '~'));
    else {
      const simple = path.replace(/^\$\./, '').replace(/\[(\d+)\]/g, '.$1').replace(/\/-$/, '.-');
      if (!path.startsWith('$.') || !/^[\w-]+(?:\.[\w-]+)*$/.test(simple)) throw new Error('Unsupported patch selector; submit a full dashboard instead.');
      keys = simple.split('.');
    }
    if (keys.some(key => ['__proto__', 'prototype', 'constructor'].includes(key))) throw new Error('Unsafe patch path.');
    let parent = result;
    for (const key of keys.slice(0, -1)) {
      if (!parent || typeof parent !== 'object' || !Object.prototype.hasOwnProperty.call(parent, key)) throw new Error('Patch parent path does not exist.');
      parent = parent[key];
    }
    if (!parent || typeof parent !== 'object') throw new Error('Patch parent is not an object.');
    const key = keys.at(-1)!;
    if (Array.isArray(parent)) {
      const index = key === '-' && op.op === 'add' ? parent.length : /^\d+$/.test(key) ? Number(key) : -1;
      if (index < 0 || index > parent.length || (op.op !== 'add' && index === parent.length)) throw new Error('Invalid patch array index.');
      if (op.op === 'add') parent.splice(index, 0, op.value);
      else if (op.op === 'remove') parent.splice(index, 1);
      else parent[index] = op.value;
    } else {
      if (op.op !== 'add' && !Object.prototype.hasOwnProperty.call(parent, key)) throw new Error('Patch target does not exist.');
      if (op.op === 'remove') delete parent[key]; else parent[key] = op.value;
    }
  }
  if (result.uid !== original.uid) throw new Error('Patch cannot change the target dashboard UID.');
  return result;
}
