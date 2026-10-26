import type { llm } from '@grafana/llm';

type ToolDefinition = { name: string; description?: string; inputSchema?: object };

/** Describe native Grafana tools in the model provider's function-calling format. */
export function modelToolSchemas(tools: ToolDefinition[]): llm.Tool[] {
  return tools.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      ...(tool.description ? { description: tool.description } : {}),
      parameters: tool.inputSchema ?? { type: 'object', properties: {} },
    },
  }));
}
