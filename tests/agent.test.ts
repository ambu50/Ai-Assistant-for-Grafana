import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ enabled: vi.fn(), mcpEnabled: vi.fn(), chat: vi.fn(), call: vi.fn(), close: vi.fn(), list: vi.fn() }));
vi.mock('@grafana/llm', () => ({
  llm: { enabled: mocks.enabled, chatCompletions: mocks.chat, Model: { BASE: 'base' } },
  mcp: { enabled: mocks.mcpEnabled, streamableHTTPURL: () => new URL('http://localhost/mcp'),
    StreamableHTTPClientTransport: class {}, convertToolsToOpenAI: (tools: unknown) => tools,
    Client: class { connect = vi.fn().mockResolvedValue(undefined); listTools = mocks.list; callTool = mocks.call; close = mocks.close; } },
}));
vi.mock('../src/sessionTools', () => ({ SessionToolClient: class { listTools = mocks.list; callTool = mocks.call; close = mocks.close; } }));
import { extractDashboardInfo, extractDashboardRefsFromText, normalizeMarkdownTables, runAgent, thinkingRequest } from '../src/agent';
const answer = { choices: [{ message: { role: 'assistant', content: 'Done' } }] };
const tool = (name: string) => ({ choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: '1', type: 'function', function: { name, arguments: JSON.stringify(name === 'update_dashboard' ? { dashboard: { uid: 'test', title: 'New Dashboard', panels: [] } } : { uid: 'test' }) } }] } }] });
beforeEach(() => {
  vi.resetAllMocks(); mocks.enabled.mockResolvedValue(true); mocks.mcpEnabled.mockResolvedValue(true);
  mocks.list.mockResolvedValue({ tools: [{ name: 'update_dashboard' }, { name: 'search_dashboards' }, { name: 'get_dashboard_by_uid' }] });
  mocks.close.mockResolvedValue(undefined); mocks.call.mockImplementation(async ({ name }) => name === 'get_dashboard_by_uid' ? { content: [{ type: 'text', text: JSON.stringify({ dashboard: { uid: 'test', title: 'New Dashboard', panels: [], version: 1 } }) }] } : { content: [] });
});
describe('investigation agent', () => {
  it('reports waiting before a slow model returns and tool progress during execution', async () => {
    let finish: (value: unknown) => void = () => {};
    mocks.chat.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce(answer);
    const activity = vi.fn();
    const running = runAgent([], '', new AbortController().signal, vi.fn(), activity);
    await vi.waitFor(() => expect(activity).toHaveBeenCalledWith('Waiting for model response · round 1…'));
    expect(mocks.call).not.toHaveBeenCalled();
    finish(tool('search_dashboards'));
    await running;
    expect(activity).toHaveBeenCalledWith('Running search_dashboards…');
    expect(activity).toHaveBeenCalledWith('Completed search_dashboards');
    expect(activity).toHaveBeenCalledWith('Waiting for model response · round 2…');
  });
  it('loads extra tool schemas on demand instead of sending the entire catalog', async () => {
    mocks.chat.mockResolvedValueOnce({ choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'discover', type: 'function', function: { name: 'ai_discover_tools', arguments: '{"names":["update_dashboard"]}' } }] } }] }).mockResolvedValueOnce(answer);
    await runAgent([{ role: 'user', content: 'Build a dashboard' }], '', new AbortController().signal, vi.fn(), vi.fn());
    // convertToolsToOpenAI is identity in this mock.
    expect(mocks.chat.mock.calls[0][0].tools).not.toContainEqual({ name: 'update_dashboard' });
    expect(mocks.chat.mock.calls[1][0].tools).toContainEqual({ name: 'update_dashboard' });
    expect(mocks.call).not.toHaveBeenCalled();
  });
  it('sends only chat fields from persisted conversation history', async () => {
    mocks.chat.mockResolvedValueOnce(answer);
    await runAgent([{ role: 'assistant', content: 'Earlier answer', dashboards: [{ uid: 'demo' }], steps: [] }], '', new AbortController().signal, vi.fn(), vi.fn());
    expect(mocks.chat.mock.calls[0][0].messages[1]).toEqual({ role: 'assistant', content: 'Earlier answer' });
  });
  it('preserves structured LLM error details', async () => {
    mocks.chat.mockRejectedValue({ status: 500, data: { error: { message: 'Provider unavailable' } } });
    await expect(runAgent([], '', new AbortController().signal, vi.fn(), vi.fn())).rejects.toThrow('LLM chat completion: HTTP 500: Provider unavailable');
  });
  it('does not label failed MCP writes as completed dashboards', async () => {
    mocks.chat.mockResolvedValueOnce(tool('update_dashboard')).mockResolvedValueOnce(answer);
    mocks.call.mockImplementation(async ({ name }) => name === 'get_dashboard_by_uid' ? { content: [{ type: 'text', text: '{"dashboard":{"uid":"test","panels":[]}}' }] } : { isError: true, content: [{ type: 'text', text: 'Permission denied' }] });
    const output = vi.fn();
    await runAgent([], '', new AbortController().signal, output, vi.fn());
    expect(output).toHaveBeenCalledWith(expect.stringContaining('Unresolved steps'), undefined, [expect.objectContaining({ status: 'failed' })]);
  });
  it('executes a multi-step task including writes without approval pauses', async () => {
    mocks.chat.mockResolvedValueOnce(tool('search_dashboards')).mockResolvedValueOnce(tool('update_dashboard')).mockResolvedValueOnce(answer);
    const output = vi.fn();
    await runAgent([{ role: 'user', content: 'Find and update my dashboard' }], '', new AbortController().signal, output, vi.fn());
    expect(mocks.call.mock.calls.map(call => call[0].name)).toEqual(['search_dashboards', 'get_dashboard_by_uid', 'update_dashboard', 'get_dashboard_by_uid']);
    expect(output).toHaveBeenCalledWith(
      expect.stringContaining('[Open New Dashboard](/d/test)'),
      [{ uid: 'test', title: 'New Dashboard', url: '/d/test' }],
      expect.any(Array)
    );
    expect(mocks.close).toHaveBeenCalled();
  });
  it('does not dispatch tools the server did not advertise', async () => {
    mocks.chat.mockResolvedValueOnce(tool('unavailable_tool')).mockResolvedValueOnce(answer);
    await runAgent([], '', new AbortController().signal, vi.fn(), vi.fn());
    expect(mocks.call).not.toHaveBeenCalled();
  });
  it('stops before dispatching a tool when cancelled during the model request', async () => {
    const controller = new AbortController();
    mocks.chat.mockImplementation(async () => { controller.abort(); return tool('search_dashboards'); });
    await expect(runAgent([], '', controller.signal, vi.fn(), vi.fn())).rejects.toThrow('Stopped');
    expect(mocks.call).not.toHaveBeenCalled(); expect(mocks.close).toHaveBeenCalled();
  });
  it('uses native session tools without consulting the privileged MCP endpoint', async () => {
    mocks.mcpEnabled.mockResolvedValue(false); mocks.chat.mockResolvedValue(answer);
    await runAgent([], '', new AbortController().signal, vi.fn(), vi.fn());
    expect(mocks.chat.mock.calls[0][0]).toHaveProperty('tools');
    expect(mocks.mcpEnabled).not.toHaveBeenCalled();
  });
  it('continues beyond eight rounds until the task completes', async () => {
    for (let i = 0; i < 12; i++) { mocks.chat.mockResolvedValueOnce(tool('search_dashboards')); }
    mocks.chat.mockResolvedValueOnce(answer);
    const output = vi.fn();
    await runAgent([], '', new AbortController().signal, output, vi.fn());
    expect(mocks.chat).toHaveBeenCalledTimes(13);
    expect(mocks.call).toHaveBeenCalledTimes(12);
    expect(output).toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalled();
  });
  it('still honors Stop after more than eight rounds', async () => {
    const controller = new AbortController();
    let rounds = 0;
    mocks.chat.mockImplementation(async () => {
      if (++rounds === 12) { controller.abort(); }
      return tool('search_dashboards');
    });
    await expect(runAgent([], '', controller.signal, vi.fn(), vi.fn())).rejects.toThrow('Stopped');
    expect(mocks.chat).toHaveBeenCalledTimes(12);
    expect(mocks.call).toHaveBeenCalledTimes(11);
    expect(mocks.close).toHaveBeenCalled();
  });
  it('automatically proceeds without pausing if the model asks for permission instead of calling tools', async () => {
    mocks.chat
      .mockResolvedValueOnce({ choices: [{ message: { role: 'assistant', content: 'Would you like me to create the dashboard now?' } }] })
      .mockResolvedValueOnce(tool('update_dashboard'))
      .mockResolvedValueOnce(answer);
    const output = vi.fn();
    const activity = vi.fn();
    await runAgent([{ role: 'user', content: 'Create a dashboard' }], '', new AbortController().signal, output, activity);
    expect(mocks.call.mock.calls.map(call => call[0].name)).toEqual(['get_dashboard_by_uid', 'update_dashboard', 'get_dashboard_by_uid']);
    expect(activity).toHaveBeenCalledWith('Proceeding with execution autonomously…');
    expect(output).toHaveBeenCalledWith(
      expect.stringContaining('[Open New Dashboard](/d/test)'),
      [{ uid: 'test', title: 'New Dashboard', url: '/d/test' }],
      expect.any(Array)
    );
    expect(mocks.close).toHaveBeenCalled();
  });
  it('returns normal informational answers without permission prompts immediately', async () => {
    mocks.chat.mockResolvedValueOnce({ choices: [{ message: { role: 'assistant', content: 'PromQL is a query language.' } }] });
    const output = vi.fn();
    await runAgent([{ role: 'user', content: 'What is PromQL?' }], '', new AbortController().signal, output, vi.fn());
    expect(mocks.call).not.toHaveBeenCalled();
    expect(output).toHaveBeenCalledWith('PromQL is a query language.');
  });
  it('extracts dashboard details from tool args and outputs', () => {
    const extracted = extractDashboardInfo('create_dashboard', { dashboard: { title: 'K8s', uid: 'k8s-uid' } }, { content: [{ text: '{"url":"/d/k8s-uid/k8s"}' }] });
    expect(extracted).toEqual({ uid: 'k8s-uid', title: 'K8s', url: '/d/k8s-uid/k8s' });

    expect(extractDashboardInfo('list_datasources', {}, {})).toBeUndefined();
  });
  it('extracts dashboard links from markdown text', () => {
    const refs = extractDashboardRefsFromText('Check out [Cluster Overview](/d/cluster-health) and /d/node-exporter.');
    expect(refs).toEqual([
      { uid: 'cluster-health', title: 'Cluster Overview', url: '/d/cluster-health' },
      { uid: 'node-exporter', title: 'node-exporter', url: '/d/node-exporter' },
    ]);
  });
  it('normalizes single-line collapsed tables into multiline GFM tables', () => {
    const input = '| Query | Matches | |---|---| | cluster health | 0 | | cluster | 0 |';
    const expected = '| Query | Matches |\n|---|---|\n| cluster health | 0 |\n| cluster | 0 |';
    expect(normalizeMarkdownTables(input)).toEqual(expected);
  });
});

describe('thinking effort', () => {
  it('sends no extra parameters when off (provider default)', () => {
    expect(thinkingRequest('off')).toEqual({});
    expect(thinkingRequest('off')).not.toHaveProperty('reasoning_effort');
    expect(thinkingRequest('off')).not.toHaveProperty('max_tokens');
  });
  it('maps low/medium/high only to the standard reasoning_effort field', () => {
    expect(thinkingRequest('low')).toEqual({ reasoning_effort: 'low' });
    expect(thinkingRequest('medium')).toEqual({ reasoning_effort: 'medium' });
    expect(thinkingRequest('high')).toEqual({ reasoning_effort: 'high' });
    // No provider-specific kwargs and no hardcoded token caps.
    for (const level of ['low', 'medium', 'high'] as const) {
      expect(thinkingRequest(level)).not.toHaveProperty('chat_template_kwargs');
      expect(thinkingRequest(level)).not.toHaveProperty('max_tokens');
    }
  });
  it('applies the selected effort to the outbound chat request', async () => {
    mocks.chat.mockResolvedValueOnce(answer);
    await runAgent([], '', new AbortController().signal, vi.fn(), vi.fn(), 'high');
    expect(mocks.chat.mock.calls[0][0]).toMatchObject({ reasoning_effort: 'high' });
  });
  it('defaults to provider default (no reasoning_effort) when unspecified', async () => {
    mocks.chat.mockResolvedValueOnce(answer);
    await runAgent([], '', new AbortController().signal, vi.fn(), vi.fn());
    expect(mocks.chat.mock.calls[0][0]).not.toHaveProperty('reasoning_effort');
  });
});

describe('output-limit truncation', () => {
  it('does not execute tool calls cut off at the limit and nudges the model to split up', async () => {
    mocks.chat.mockResolvedValueOnce({ choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: '1', type: 'function', function: { name: 'update_dashboard', arguments: '{"dashboard":{"title":"X"' } }] }, finish_reason: 'length' }] }).mockResolvedValueOnce(answer);
    const activity = vi.fn();
    await runAgent([{ role: 'user', content: 'make a dashboard' }], '', new AbortController().signal, vi.fn(), activity);
    expect(mocks.call).not.toHaveBeenCalled();
    expect(activity).toHaveBeenCalledWith('Output limit reached — asking the model to split the work into smaller steps…');
  });
  it('appends a warning when the final answer is truncated', async () => {
    mocks.chat.mockResolvedValueOnce({ choices: [{ message: { role: 'assistant', content: 'Partial answer' }, finish_reason: 'length' }] });
    const output = vi.fn();
    await runAgent([], '', new AbortController().signal, output, vi.fn());
    expect(output.mock.calls[0][0]).toContain('output limit');
  });
});

describe('planned execution and verification', () => {
  const calls = (...items: Array<[string, Record<string, unknown>]>) => ({ choices: [{ message: { role: 'assistant', content: null, tool_calls: items.map(([name, args], i) => ({ id: String(i), type: 'function', function: { name, arguments: JSON.stringify(args) } })) } }] });
  it('executes a dependency plan immediately and verifies a dashboard before success', async () => {
    mocks.chat.mockResolvedValueOnce(calls(
      ['set_task_plan', { summary: 'Update and verify dashboard', steps: [
        { id: 'inspect', description: 'Find dashboard', kind: 'inspect', dependsOn: [] },
        { id: 'write', description: 'Update dashboard', kind: 'write', dependsOn: ['inspect'] },
        { id: 'verify', description: 'Verify saved dashboard', kind: 'verify', dependsOn: ['write'] },
      ] }],
      ['task_step', { id: 'inspect', action: 'start' }], ['search_dashboards', {}],
      ['task_step', { id: 'inspect', action: 'complete', outcome: 'Found target' }],
      ['task_step', { id: 'write', action: 'start' }],
      ['update_dashboard', { dashboard: { uid: 'test', title: 'New Dashboard', panels: [] } }],
      ['task_step', { id: 'write', action: 'complete', outcome: 'Saved and read back' }],
      ['task_step', { id: 'verify', action: 'start' }], ['get_dashboard_by_uid', { uid: 'test' }],
      ['task_step', { id: 'verify', action: 'complete', outcome: 'Verified target' }],
    )).mockResolvedValueOnce(answer);
    const progress = vi.fn(), output = vi.fn();
    await runAgent([{ role: 'user', content: 'Update dashboard test' }], '', new AbortController().signal, output, vi.fn(), 'off', progress);
    expect(progress.mock.calls.at(-1)![0].steps.map((s: any) => s.status)).toEqual(['completed', 'completed', 'completed']);
    expect(progress.mock.calls.at(-1)![0].dashboards).toEqual([expect.objectContaining({ uid: 'test', status: 'verified' })]);
    expect(output.mock.calls[0][0]).toContain('configuration verified');
    expect(mocks.chat).toHaveBeenCalledTimes(2);
  });
  it('keeps mismatched saved dashboards unverified and does not show a verified link', async () => {
    let reads = 0;
    mocks.call.mockImplementation(async ({ name }) => name === 'get_dashboard_by_uid'
      ? { dashboard: { uid: 'test', title: ++reads === 1 ? 'New Dashboard' : 'Wrong title', panels: [] } }
      : { uid: 'test' });
    mocks.chat.mockResolvedValueOnce(tool('update_dashboard')).mockResolvedValueOnce(answer);
    const output = vi.fn(), progress = vi.fn();
    await runAgent([], '', new AbortController().signal, output, vi.fn(), 'off', progress);
    expect(progress.mock.calls.at(-1)![0].dashboards[0].status).toBe('unverified');
    expect(output.mock.calls[0][0]).toContain('verification incomplete');
    expect(output.mock.calls[0][1]).toBeUndefined();
  });
  it('requires malformed plans to be corrected before dashboard writes', async () => {
    mocks.chat.mockResolvedValueOnce(calls(['set_task_plan', { summary: 'Invalid', steps: [{ id: 'x' }] }], ['update_dashboard', { dashboard: { uid: 'test' } }])).mockResolvedValueOnce(answer);
    await runAgent([], '', new AbortController().signal, vi.fn(), vi.fn());
    expect(mocks.call).not.toHaveBeenCalled();
  });
  it('Stop settles promptly during an unresponsive provider request', async () => {
    mocks.chat.mockReturnValue(new Promise(() => {}));
    const controller = new AbortController(), progress = vi.fn();
    const pending = runAgent([], '', controller.signal, vi.fn(), vi.fn(), 'off', progress);
    await vi.waitFor(() => expect(mocks.chat).toHaveBeenCalled());
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(progress.mock.calls.at(-1)![0].steps[0].status).toBe('failed');
    expect(mocks.call).not.toHaveBeenCalled();
  });
  it('carries checkpoint evidence as context for a safe follow-up', async () => {
    mocks.chat.mockResolvedValueOnce(answer);
    await runAgent([{ role: 'assistant', content: 'Previous failure', plan: { revision: 1, summary: 'Edit dashboard', steps: [], actions: [], queries: [], dashboards: [{ uid: 'target', status: 'unverified', detail: 'Write timed out', at: 1 }] } }], '', new AbortController().signal, vi.fn(), vi.fn());
    expect(mocks.chat.mock.calls[0][0].messages).toContainEqual(expect.objectContaining({ role: 'system', content: expect.stringContaining('Reinspect current resources') }));
  });
});
it('blocks a planned dashboard mutation before its inspection prerequisite is complete', async () => {
  mocks.chat.mockResolvedValueOnce({ choices: [{ message: { role: 'assistant', content: null, tool_calls: [
    { id: 'plan', type: 'function', function: { name: 'set_task_plan', arguments: JSON.stringify({ summary: 'Edit dashboard', steps: [
      { id: 'inspect', description: 'Inspect first', kind: 'inspect', dependsOn: [] },
      { id: 'write', description: 'Write next', kind: 'write', dependsOn: ['inspect'] },
    ] }) } },
    { id: 'write', type: 'function', function: { name: 'update_dashboard', arguments: '{"dashboard":{"uid":"test"}}' } },
  ] } }] }).mockResolvedValueOnce(answer);
  await runAgent([], '', new AbortController().signal, vi.fn(), vi.fn());
  expect(mocks.call).not.toHaveBeenCalled();
});
it('verifies partial dashboard patches against the refreshed pre-write state without a second write', async () => {
  let model = { uid: 'test', title: 'New Dashboard', version: 1, tags: ['ops'], panels: [{ id: 1, title: 'Original', type: 'text', options: { content: 'Keep' } }] };
  mocks.call.mockImplementation(async ({ name, arguments: args }) => {
    if (name === 'get_dashboard_by_uid') return { dashboard: JSON.parse(JSON.stringify(model)) };
    if (name === 'update_dashboard') {
      model = { ...model, version: 2, panels: [...model.panels, args.operations[0].value] };
      return { uid: 'test', status: 'success' };
    }
    return {};
  });
  mocks.chat.mockResolvedValueOnce({ choices: [{ message: { role: 'assistant', content: null, tool_calls: [
    { id: 'patch', type: 'function', function: { name: 'update_dashboard', arguments: JSON.stringify({ uid: 'test', operations: [{ op: 'add', path: '$.panels/-', value: { id: 2, title: 'Added', type: 'text', options: { content: 'New' } } }] }) } },
  ] } }] }).mockResolvedValueOnce(answer);
  const progress = vi.fn();
  await runAgent([], '', new AbortController().signal, vi.fn(), vi.fn(), 'off', progress);
  expect(mocks.call.mock.calls.filter(call => call[0].name === 'update_dashboard')).toHaveLength(1);
  expect(progress.mock.calls.at(-1)![0].dashboards[0].status).toBe('verified');
  expect(model.panels[0].options.content).toBe('Keep');
});
it('stops immediately on a native Grafana authorization denial without alternate tool retries', async () => {
  mocks.call.mockRejectedValue({ status: 403, data: { message: 'Access denied' } });
  mocks.chat.mockResolvedValueOnce(tool('get_dashboard_by_uid')).mockResolvedValueOnce(tool('update_dashboard')).mockResolvedValueOnce(answer);
  await expect(runAgent([{ role: 'user', content: 'Delete a panel from dashboard test' }], '', new AbortController().signal, vi.fn(), vi.fn())).rejects.toThrow('Grafana denied');
  expect(mocks.call).toHaveBeenCalledTimes(1);
  expect(mocks.chat).toHaveBeenCalledTimes(1);
  expect(mocks.mcpEnabled).not.toHaveBeenCalled();
});
it('offers a copy after an edit denial only when the source remains readable, without automatically creating it', async () => {
  mocks.chat.mockResolvedValueOnce(tool('update_dashboard'));
  mocks.call.mockImplementation(async ({ name }) => {
    if (name === 'get_dashboard_by_uid') return { dashboard: { uid: 'test', title: 'Protected dashboard', panels: [], version: 1 } };
    throw { status: 403 };
  });
  const text = vi.fn();
  await runAgent([{ role: 'user', content: 'Remove the CPU panel' }], '', new AbortController().signal, text, vi.fn());
  expect(text).toHaveBeenCalledWith(expect.stringContaining('do not have permission'), undefined, expect.any(Array), { sourceUid: 'test', sourceTitle: 'Protected dashboard', request: 'Remove the CPU panel' });
  expect(mocks.call.mock.calls.filter(([call]) => call.name === 'update_dashboard')).toHaveLength(1);
  expect(mocks.call.mock.calls.some(([call]) => call.name === 'create_dashboard_copy')).toBe(false);
});
it('verifies the new copy rather than the protected source after an explicit copy request', async () => {
  mocks.list.mockResolvedValue({ tools: [{ name: 'create_dashboard_copy' }, { name: 'get_dashboard_by_uid' }] });
  const expected = { id: null, uid: null, version: 0, title: 'Source (copy)', panels: [{ id: 2 }] };
  mocks.chat.mockResolvedValueOnce({ choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'copy', type: 'function', function: { name: 'create_dashboard_copy', arguments: JSON.stringify({ sourceUid: 'source', operations: [{ op: 'remove', path: '/panels/0' }] }) } }] } }] }).mockResolvedValueOnce(answer);
  mocks.call.mockImplementation(async ({ name }) => name === 'create_dashboard_copy' ? { uid: 'copied', title: 'Source (copy)', expectedDashboard: expected } : { dashboard: { ...expected, uid: 'copied', id: 20, version: 1 } });
  const text = vi.fn();
  await runAgent([{ role: 'user', content: 'Create a modified copy with create_dashboard_copy; remove the first panel.' }], '', new AbortController().signal, text, vi.fn());
  expect(mocks.call).toHaveBeenCalledWith({ name: 'get_dashboard_by_uid', arguments: { uid: 'copied' } });
  expect(text.mock.calls.at(-1)?.[1]).toContainEqual(expect.objectContaining({ uid: 'copied' }));
  expect(mocks.call.mock.calls.some(([call]) => call.name === 'update_dashboard')).toBe(false);
});
