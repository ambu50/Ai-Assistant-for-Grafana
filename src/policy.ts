export function parseArguments(raw: string): Record<string, unknown> {
  const args: unknown = JSON.parse(raw);
  if (!args || typeof args !== 'object' || Array.isArray(args)) { throw new Error('Tool arguments must be an object.'); }
  return args as Record<string, unknown>;
}
