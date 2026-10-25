import type { DatasourceContext } from './datasourceContext';
import type { DashboardContext } from './dashboardContext';
import type { ChatMessage, ThinkingEffort } from './agent';

export interface SavedConversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  context: string;
  range: string;
  thinkingEffort?: ThinkingEffort;
  viewContext?: DashboardContext;
  datasource?: DatasourceContext;
}

export const STORAGE_KEY = 'ai_assistant_conversations_v1';
export const ACTIVE_KEY = 'ai_assistant_active_id_v1';
const MAX_SAVED = 30;
let storageIdentity: string | undefined;
export function setStorageIdentity(userId: unknown, orgId: unknown): void {
  const user = Number(userId), org = Number(orgId);
  storageIdentity = Number.isSafeInteger(user) && user > 0 && Number.isSafeInteger(org) && org > 0 ? `${org}:${user}` : undefined;
}
function key(base: string): string { return `${base}:${storageIdentity}`; }

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function deriveTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find(m => m.role === 'user');
  if (!firstUser || !firstUser.content.trim()) {
    return 'New conversation';
  }
  const clean = firstUser.content.trim().replace(/\s+/g, ' ');
  return clean.length > 36 ? clean.slice(0, 34) + '…' : clean;
}

export function loadSavedState(): { conversations: SavedConversation[]; activeId: string } {
  try {
    if (typeof localStorage === 'undefined' || !storageIdentity) {
      const fresh = generateId();
      return { conversations: [], activeId: fresh };
    }
    const raw = localStorage.getItem(key(STORAGE_KEY));
    const savedActive = localStorage.getItem(key(ACTIVE_KEY)) || '';
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const validList = parsed.filter(item => item && typeof item === 'object' && typeof item.id === 'string') as SavedConversation[];
        if (validList.length > 0) {
          const activeId = validList.some(c => c.id === savedActive) ? savedActive : validList[0].id;
          return { conversations: validList, activeId };
        }
      }
    }
  } catch (e) {
    console.warn('Failed to load saved conversations:', e);
  }
  return { conversations: [], activeId: generateId() };
}

export function persistSavedState(conversations: SavedConversation[], activeId: string): void {
  try {
    if (typeof localStorage === 'undefined' || !storageIdentity) {
      return;
    }
    let list = conversations.slice(0, MAX_SAVED);
    let attempts = 0;
    while (attempts < 5) {
      try {
        localStorage.setItem(key(STORAGE_KEY), JSON.stringify(list));
        localStorage.setItem(key(ACTIVE_KEY), activeId);
        return;
      } catch (err) {
        if (list.length > 1) {
          list = list.slice(0, Math.floor(list.length * 0.75));
          attempts++;
        } else {
          console.warn('Storage quota exceeded:', err);
          return;
        }
      }
    }
  } catch (e) {
    console.warn('Failed to persist conversations:', e);
  }
}
