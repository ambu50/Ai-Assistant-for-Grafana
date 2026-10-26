import { ChatMessage, DashboardRef, runAgent, ThinkingEffort, ToolStep } from './agent';
import { TaskPlan } from './planning';
import { formatError } from './errors';
import { deriveTitle, loadSavedState, persistSavedState, SavedConversation } from './storage';

// Module-level store so an in-flight run survives component unmount (e.g. navigating to
// Dashboards and back inside the Grafana SPA). The plugin bundle stays loaded, so this state
// and the running promise keep going; the UI re-subscribes on remount. This does not survive
// a full page reload — there the browser aborts the request anyway, but the user turn and any
// completed steps are already persisted to localStorage.
export interface RunEvent { text: string; at: number }
export interface RunSnapshot {
  conversationId: string;
  running: boolean;
  startedAt: number;
  activity: string;
  events: RunEvent[];
  error: string;
  plan?: TaskPlan;
}

let snapshot: RunSnapshot | null = null;
let controller: AbortController | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

export function subscribeRun(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function getRun(): RunSnapshot | null { return snapshot; }

// Persist messages for a conversation without touching its other fields.
function mergeMessages(conversationId: string, messages: ChatMessage[]): void {
  const { conversations, activeId } = loadSavedState();
  const existing = conversations.find((c) => c.id === conversationId);
  if (!existing) { return; }
  const updated: SavedConversation = { ...existing, messages, updatedAt: Date.now() };
  persistSavedState(conversations.map((c) => (c.id === conversationId ? updated : c)), activeId);
}

function noteActivity(text: string): void {
  if (!snapshot || !snapshot.running) { return; }
  snapshot = { ...snapshot, activity: text, events: [...snapshot.events, { text, at: Date.now() }].slice(-30) };
  emit();
}

export function beginRun(opts: { conversationId: string; messages: ChatMessage[]; context: string; effort: ThinkingEffort; }): void {
  const { conversationId, messages, context, effort } = opts;
  controller?.abort();
  controller = new AbortController();
  const signal = controller.signal;
  snapshot = { conversationId, running: true, startedAt: Date.now(), activity: '', events: [], error: '' };
  const saved = loadSavedState();
  if (!saved.conversations.some(c => c.id === conversationId)) {
    let details: { notes?: string; timeWindow?: string | { from: string; to: string }; dashboard?: SavedConversation['viewContext']; datasource?: SavedConversation['datasource'] } = {};
    try { details = JSON.parse(context); } catch { /* Plain context remains supported. */ }
    persistSavedState([{ id: conversationId, title: deriveTitle(messages), createdAt: Date.now(), updatedAt: Date.now(), messages,
      context: details.notes || '', range: typeof details.timeWindow === 'string' ? details.timeWindow : details.dashboard ? 'Dashboard time range' : 'Last 1 hour', thinkingEffort: effort, viewContext: details.dashboard, datasource: details.datasource }, ...saved.conversations], conversationId);
  }
  // Save the user turn immediately so it survives even an unmount before the effect flushes.
  mergeMessages(conversationId, messages);

  const onText = (content: string, dashboards?: DashboardRef[], steps?: ToolStep[], copyOffer?: ChatMessage['copyOffer']) => {
    if (controller?.signal !== signal) return;
    mergeMessages(conversationId, [...messages, { role: 'assistant', content, dashboards, steps, copyOffer, plan: snapshot?.plan }]);
    if (snapshot && snapshot.conversationId === conversationId) { snapshot = { ...snapshot, running: false }; }
    emit();
  };

  const onProgress = (plan: TaskPlan) => {
    if (!snapshot || snapshot.conversationId !== conversationId || controller?.signal !== signal) return;
    snapshot = { ...snapshot, plan };
    mergeMessages(conversationId, [...messages, { role: 'assistant', content: 'Execution checkpoint. A full reload interrupts the task; inspect current resources before retrying changes.', plan, checkpoint: true }]);
    emit();
  };
  runAgent(messages, context, signal, onText, text => { if (controller?.signal === signal) noteActivity(text); }, effort, onProgress).catch((e: unknown) => {
    const message = e instanceof Error && e.name === 'AbortError'
      ? 'Response stopped. Any tool action already sent may have completed.'
      : formatError(e);
    if (snapshot && snapshot.conversationId === conversationId && controller?.signal === signal) {
      mergeMessages(conversationId, [...messages, { role: 'assistant', content: message, plan: snapshot.plan }]);
      snapshot = { ...snapshot, running: false, error: message };
    }
    emit();
  });
  emit();
}

export function cancelRun(): void { controller?.abort(); }
export function stopRun(): void { noteActivity('Stopping after the current request. Completed tool actions are not undone.'); controller?.abort(); }
export function clearRunError(): void { if (snapshot) { snapshot = { ...snapshot, error: '' }; emit(); } }
export function endRunIfIdle(): void { if (snapshot && !snapshot.running) { snapshot = null; emit(); } }
