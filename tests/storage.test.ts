import { beforeEach, describe, expect, it } from 'vitest';
import { deriveTitle, generateId, loadSavedState, persistSavedState, SavedConversation, STORAGE_KEY, ACTIVE_KEY, setStorageIdentity } from '../src/storage';

class LocalStorageMock {
  private store: Record<string, string> = {};
  getItem(key: string) { return this.store[key] ?? null; }
  setItem(key: string, val: string) { this.store[key] = String(val); }
  removeItem(key: string) { delete this.store[key]; }
  clear() { this.store = {}; }
}

describe('storage module', () => {
  beforeEach(() => {
    setStorageIdentity(1, 1);
    // @ts-expect-error mock
    globalThis.localStorage = new LocalStorageMock();
  });

  it('generates unique non-empty string IDs', () => {
    const id1 = generateId();
    const id2 = generateId();
    expect(id1).toBeTruthy();
    expect(id1).not.toEqual(id2);
  });

  it('derives readable titles from first user message', () => {
    expect(deriveTitle([])).toEqual('New conversation');
    expect(deriveTitle([{ role: 'assistant', content: 'Hi' }])).toEqual('New conversation');
    expect(deriveTitle([{ role: 'user', content: '   Investigate high   CPU memory   ' }])).toEqual('Investigate high CPU memory');
    expect(deriveTitle([{ role: 'user', content: 'This is a very long prompt that will definitely exceed thirty-six characters limit easily' }])).toContain('…');
  });

  it('loads empty state with fresh activeId when no storage exists', () => {
    const state = loadSavedState();
    expect(state.conversations).toEqual([]);
    expect(state.activeId).toBeTruthy();
  });

  it('persists and reloads saved conversations', () => {
    const testConv: SavedConversation = {
      id: 'conv-1',
      title: 'K8s Investigation',
      createdAt: 1000,
      updatedAt: 2000,
      messages: [{ role: 'user', content: 'K8s check' }, { role: 'assistant', content: 'Looking into it', dashboards: [{ uid: 'k8s', title: 'Kubernetes' }] }],
      context: 'cluster=prod',
      range: 'Last 1 hour',
    };
    persistSavedState([testConv], 'conv-1');

    const state = loadSavedState();
    expect(state.activeId).toEqual('conv-1');
    expect(state.conversations.length).toEqual(1);
    expect(state.conversations[0].title).toEqual('K8s Investigation');
    expect(state.conversations[0].messages[1].dashboards).toEqual([{ uid: 'k8s', title: 'Kubernetes' }]);
  });

  it('falls back gracefully on malformed JSON', () => {
    localStorage.setItem(STORAGE_KEY + ':1:1', '{invalid-json');
    localStorage.setItem(ACTIVE_KEY + ':1:1', 'some-id');
    const state = loadSavedState();
    expect(state.conversations).toEqual([]);
    expect(state.activeId).toBeTruthy();
  });
});

it('isolates conversations by user and organization and never loads the legacy shared keys', () => {
  const data = new Map<string, string>();
  globalThis.localStorage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } } as Storage;
  setStorageIdentity(1, 1);
  persistSavedState([{ id: 'admin', title: 'Private', messages: [], context: '', range: '', createdAt: 1, updatedAt: 1 }], 'admin');
  setStorageIdentity(2, 1); expect(loadSavedState().conversations).toEqual([]);
  setStorageIdentity(1, 2); expect(loadSavedState().conversations).toEqual([]);
  setStorageIdentity(1, 1); expect(loadSavedState().conversations[0].id).toBe('admin');
  setStorageIdentity(undefined, undefined); expect(loadSavedState().conversations).toEqual([]);
});
