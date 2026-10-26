import { describe, expect, it } from 'vitest';
import { formatError } from '../src/errors';
describe('Grafana error display', () => {
  it('extracts nested upstream errors with HTTP status', () => {
    expect(formatError({ status: 500, message: 'Internal Server Error', data: { error: { message: 'Model context length exceeded' } } })).toBe('HTTP 500: Model context length exceeded');
  });
  it('handles serialized JSON responses and normal exceptions', () => {
    expect(formatError({ status: 504, data: '{"message":"Provider timed out"}' })).toBe('HTTP 504: Provider timed out');
    expect(formatError(new Error('Connection refused'))).toBe('Connection refused');
  });
  it('handles circular and unknown objects without stringifying them', () => {
    const error: Record<string, unknown> = {}; error.error = error;
    expect(formatError(error)).toContain('without an error message');
    expect(formatError({})).not.toContain('[object Object]');
  });
});
