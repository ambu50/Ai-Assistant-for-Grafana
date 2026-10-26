import { expect, it } from 'vitest';
import { modelToolSchemas } from '../src/toolSchemas';

it('preserves tool names, descriptions, required arguments and nested patch schemas for the provider', () => {
  const schema = { type: 'object', properties: { uid: { type: 'string' }, operations: { type: 'array', items: { type: 'object', properties: { op: { enum: ['remove'] }, path: { type: 'string' } }, required: ['op', 'path'] } } }, required: ['uid'], additionalProperties: false };
  expect(modelToolSchemas([{ name: 'update_dashboard', description: 'Native update', inputSchema: schema }])).toEqual([{ type: 'function', function: { name: 'update_dashboard', description: 'Native update', parameters: schema } }]);
  expect(schema.required).toEqual(['uid']);
});
