import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import { assistantTheme } from '../src/theme';
import { MarkdownCodeBlock } from '../src/MarkdownCodeBlock';
vi.mock('@grafana/runtime', () => ({ config: { appSubUrl: '/grafana' } }));
// Use the SDK's Node-compatible theme modules without initializing its browser utilities.
const require = createRequire(import.meta.url);
const { createTheme } = require('../node_modules/@grafana/data/dist/cjs/themes/createTheme.cjs') as Pick<typeof import('@grafana/data'), 'createTheme'>;
const { colorManipulator } = require('../node_modules/@grafana/data/dist/cjs/themes/colorManipulator.cjs') as Pick<typeof import('@grafana/data'), 'colorManipulator'>;

describe.each(['light', 'dark'] as const)('%s Grafana theme', mode => {
  const theme = createTheme({ colors: { mode } });
  const variables = assistantTheme(theme) as Record<string, string>;
  it('uses Grafana surfaces and accessible code foreground/background pairs', () => {
    expect(variables['--bg']).toBe(theme.colors.background.canvas);
    expect(variables['--text']).toBe(theme.colors.text.primary);
    expect(variables.colorScheme).toBe(mode);
    expect(colorManipulator.getContrastRatio(variables['--code-text'], variables['--code-bg'])).toBeGreaterThanOrEqual(4.5);
  });
  it('renders readable SQL markup without nested pre elements and preserves query text', () => {
    const sql = 'SELECT * FROM metrics WHERE value < 10;';
    const html = renderToStaticMarkup(<div className="ai-app" style={assistantTheme(theme)}><div className="ai-message"><ReactMarkdown components={{ pre: MarkdownCodeBlock }}>{'```sql\n' + sql + '\n```\n\nUse `instance` to filter.'}</ReactMarkdown></div></div>);
    expect(html).toContain('SELECT * FROM metrics WHERE value &lt; 10;');
    expect(html).toContain('class="ai-code-block"');
    expect(html).not.toContain('<pre><div');
    expect(html.match(/<pre>/g)).toHaveLength(1);
    expect(html).toContain('<code>instance</code>');
    expect(html).toContain('href="/grafana/explore"');
  });
});
it('updates CSS variables when Grafana changes theme', () => {
  const dark = assistantTheme(createTheme({ colors: { mode: 'dark' } })) as Record<string,string>;
  const light = assistantTheme(createTheme({ colors: { mode: 'light' } })) as Record<string,string>;
  expect(dark['--bg']).not.toBe(light['--bg']);
  expect(dark['--code-text']).not.toBe(light['--code-text']);
});
