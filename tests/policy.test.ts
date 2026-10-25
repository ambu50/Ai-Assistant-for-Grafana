import { describe, expect, it } from 'vitest';
import { parseArguments } from '../src/policy';
describe('tool execution boundary', () => {
  it('rejects non-object or malformed tool arguments', () => {
    for (const raw of ['null', '[]', '"test"', '5', '{bad']) { expect(() => parseArguments(raw)).toThrow(); }
    expect(parseArguments('{"uid":"cluster"}')).toEqual({ uid: 'cluster' });
  });
});
