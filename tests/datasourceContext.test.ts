import { describe, expect, it } from 'vitest';
import { datasourceContext, matchingDatasources } from '../src/datasourceContext';

describe('datasource context', () => {
  it('keeps only the stable identity and type, excluding connection configuration', () => {
    expect(datasourceContext({ uid: 'p', name: 'Production', type: 'prometheus', url: 'private', jsonData: { token: 'secret' }, secureJsonFields: { password: true } })).toEqual({ uid: 'p', name: 'Production', type: 'prometheus' });
    expect(datasourceContext(null)).toBeUndefined();
    expect(datasourceContext({ name: 'Missing UID', type: 'loki' })).toBeUndefined();
  });
  it('searches case-insensitively by name, type or UID and keeps duplicate names distinct', () => {
    const items = [{ uid: 'p1', name: 'Production', type: 'prometheus' }, { uid: 'l1', name: 'Production', type: 'loki' }];
    expect(matchingDatasources(items, 'production')).toHaveLength(2);
    expect(matchingDatasources(items, ' PROMETHEUS ')).toEqual([items[0]]);
    expect(matchingDatasources(items, 'l1')).toEqual([items[1]]);
    expect(matchingDatasources(items, 'unknown')).toEqual([]);
  });
});
