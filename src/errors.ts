/** Grafana rejects requests with FetchError objects, not necessarily Error instances. */
export function formatError(value: unknown): string {
  const seen = new Set<object>();
  function detail(input: unknown, depth = 0): string {
    if (depth > 6 || input == null) { return ''; }
    if (typeof input === 'string') {
      const text = input.trim();
      if (!text || text === '[object Object]') { return ''; }
      try { return detail(JSON.parse(text), depth + 1) || text; } catch { return text; }
    }
    if (typeof input !== 'object' || seen.has(input)) { return ''; }
    seen.add(input);
    const record = input as Record<string, unknown>;
    // Prefer the upstream response body to Grafana's generic HTTP message.
    for (const key of ['data', 'error', 'message', 'detail', 'cause', 'statusText']) {
      const text = detail(record[key], depth + 1);
      if (text) { return text; }
    }
    return '';
  }
  const message = detail(value) || 'Request failed without an error message. Check Grafana and the configured LLM provider logs.';
  const status = value && typeof value === 'object' ? (value as Record<string, unknown>).status : undefined;
  return `${typeof status === 'number' && status > 0 ? `HTTP ${status}: ` : ''}${message}`;
}
