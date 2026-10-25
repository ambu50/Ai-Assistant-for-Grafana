import { DatasourcePicker } from './DatasourcePicker';
import type { DatasourceContext } from './datasourceContext';
import React, { useEffect, useRef, useState } from 'react';
import type { DashboardContext } from './dashboardContext';
import { AppRootProps } from '@grafana/data';
import { config } from '@grafana/runtime';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatMessage, normalizeMarkdownTables } from './agent';
import { beginRun, clearRunError, getRun, RunSnapshot, stopRun, subscribeRun } from './runStore';
import { deriveTitle, generateId, loadSavedState, persistSavedState, SavedConversation } from './storage';
import './styles.css';
import pluginMetadata from './plugin.json';
import { TaskChecklist } from './TaskChecklist';
import { WorkingProgress } from './WorkingProgress';
import { DashboardPicker } from './DashboardPicker';
import { dashboardMention, selectedDashboard, DashboardChoice } from './dashboardSearch';

export function App({ compact = false, viewContext }: Partial<AppRootProps> & { compact?: boolean; viewContext?: DashboardContext }) {
  const [initial] = useState(() => {
    const saved = loadSavedState();
    if (!viewContext || getRun()?.running) return saved;
    const matching = saved.conversations.find(conversation => conversation.viewContext?.dashboardUid === viewContext.dashboardUid);
    return { ...saved, activeId: matching?.id || generateId() };
  });
  const [conversations, setConversations] = useState<SavedConversation[]>(initial.conversations);
  const [activeId, setActiveId] = useState<string>(initial.activeId);

  const activeConv = conversations.find(c => c.id === activeId);
  const [attachedDashboard, setAttachedDashboard] = useState<DashboardContext | undefined>(viewContext || activeConv?.viewContext);
  const effectiveViewContext = attachedDashboard;
  const [attachedDatasource, setAttachedDatasource] = useState<DatasourceContext | undefined>(activeConv?.datasource);
  const [sourcePicker, setSourcePicker] = useState(false);
  const [picker, setPicker] = useState<{ start: number; end: number; query: string } | null>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(activeConv?.messages || []);
  const [draft, setDraft] = useState('');
  const [context, setContext] = useState(activeConv?.context || '');
  const [run, setRun] = useState<RunSnapshot | null>(getRun());
  const progress: RunSnapshot | null = run && run.running && run.conversationId === activeId ? run : null;
  const busy = !!progress;
  const error = run && !run.running && run.conversationId === activeId ? run.error : '';
  const bottom = useRef<HTMLDivElement>(null);
  const prevRunning = useRef(false);

  // Reattach to a run that continued while this component was unmounted (SPA navigation).
  useEffect(() => subscribeRun(() => setRun(getRun())), []);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, run?.activity]);
  useEffect(() => {
    if (prevRunning.current && run && !run.running && run.conversationId === activeId) {
      const saved = loadSavedState().conversations.find(c => c.id === activeId);
      setMessages(saved?.messages || []);
    }
    prevRunning.current = !!run && run.running && run.conversationId === activeId;
  }, [run, activeId]);

  useEffect(() => {
    if (!messages.length && !context && !effectiveViewContext && !activeConv?.viewContext && !attachedDatasource && !activeConv?.datasource) {
      return;
    }
    const title = deriveTitle(messages);
    setConversations(prev => {
      const existing = prev.find(c => c.id === activeId);
      const updated: SavedConversation = {
        id: activeId,
        title,
        createdAt: existing?.createdAt || Date.now(),
        updatedAt: Date.now(),
        messages,
        context,
        range: effectiveViewContext ? 'Dashboard time range' : '',
        viewContext: effectiveViewContext,
        datasource: attachedDatasource,
      };
      const nextList = [updated, ...prev.filter(c => c.id !== activeId)];
      persistSavedState(nextList, activeId);
      return nextList;
    });
  }, [messages, context, activeId, effectiveViewContext, attachedDatasource]);

  function switchConversation(id: string) {
    if (busy || id === activeId) return;
    const target = conversations.find(c => c.id === id);
    if (target) {
      setActiveId(target.id);
      setAttachedDashboard(viewContext || target.viewContext); setPicker(null);
      setAttachedDatasource(target.datasource); setSourcePicker(false);
      setMessages(target.messages || []);
      setContext(target.context || '');
      setDraft('');
      clearRunError();
      persistSavedState(conversations, target.id);
    }
  }

  function startNewConversation() {
    if (busy) return;
    const freshId = generateId();
    setActiveId(freshId);
    setAttachedDashboard(viewContext); setPicker(null);
    setAttachedDatasource(undefined); setSourcePicker(false);
    setMessages([]);
    setContext('');
    setDraft('');
    clearRunError();
    persistSavedState(conversations, freshId);
  }

  function deleteConversation(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (busy && id === activeId) return;
    const nextList = conversations.filter(c => c.id !== id);
    setConversations(nextList);
    if (id === activeId) {
      if (nextList.length > 0) {
        const nextActive = nextList[0];
        setActiveId(nextActive.id);
        setAttachedDashboard(viewContext || nextActive.viewContext); setPicker(null);
        setAttachedDatasource(nextActive.datasource); setSourcePicker(false);
        setMessages(nextActive.messages || []);
        setContext(nextActive.context || '');
        persistSavedState(nextList, nextActive.id);
      } else {
        const freshId = generateId();
        setActiveId(freshId);
        setAttachedDashboard(viewContext); setPicker(null);
    setAttachedDatasource(undefined); setSourcePicker(false);
        setMessages([]);
        setContext('');
        persistSavedState([], freshId);
      }
    } else {
      persistSavedState(nextList, activeId);
    }
  }

  function attachDashboard(choice: DashboardChoice) {
    setAttachedDashboard(selectedDashboard(choice));
    if (picker && picker.start >= 0) setDraft(draft.slice(0, picker.start) + draft.slice(picker.end));
    setPicker(null);
    requestAnimationFrame(() => composer.current?.focus());
  }
  const stop = () => stopRun();

  function send(text: string) {
    if (!text.trim() || (run && run.running)) { return; }
    const next: ChatMessage[] = [...messages, { role: 'user', content: text.trim() }];
    setMessages(next); setDraft(''); setPicker(null); setSourcePicker(false); clearRunError();
    beginRun({ conversationId: activeId, messages: next, context: JSON.stringify({ timeWindow: effectiveViewContext?.from && effectiveViewContext?.to ? { from: effectiveViewContext.from, to: effectiveViewContext.to } : undefined, now: new Date().toISOString(), notes: context, dashboard: effectiveViewContext, datasource: attachedDatasource }), effort: 'off' });
  }
  return <div className={`ai-app${compact ? ' ai-embedded' : ''}${!messages.length ? ' ai-empty' : ''}`}>
    <aside className="ai-sidebar">
      <div className="ai-brand"><span className="ai-mark">✦</span> AI Assistant</div>
      <button className="ai-new" disabled={busy} onClick={startNewConversation}>＋ New conversation</button>
      <div className="ai-label">WORKSPACE</div>
      <div className="ai-nav active">✧ &nbsp; Assistant</div>
      <a className="ai-nav" href={`${config.appSubUrl}/dashboards`}>▦ &nbsp; Dashboards ↗</a>
      <a className="ai-nav" href={`${config.appSubUrl}/explore`}>⌕ &nbsp; Explore ↗</a>
      {conversations.length > 0 && <div className="ai-history-section">
        <div className="ai-label">RECENT CONVERSATIONS</div>
        <div className="ai-history-list" role="navigation" aria-label="Conversation history">
          {conversations.map(c => <div key={c.id} className={`ai-history-item ${c.id === activeId ? 'active' : ''}`} onClick={() => switchConversation(c.id)} title={c.title}>
            <span className="ai-history-title">{c.title}</span>
            <button type="button" className="ai-history-del" title="Delete conversation" aria-label={`Delete conversation ${c.title}`} onClick={e => deleteConversation(e, c.id)}>×</button>
          </div>)}
        </div>
      </div>}
      <div className="ai-sidebottom"><span className="ai-label">POWERED BY</span><p>Grafana LLM + Grafana API</p><small>Conversations stay preserved in local browser storage. Tools run with your Grafana permissions. Prompts and tool results are sent to your configured provider.</small><a href={`${config.appSubUrl}/plugins/grafana-llm-app`}>Configure connection ↗</a></div>
    </aside>
    <main className="ai-main">
      <header><h2>Assistant <span className="ai-beta" title="Loaded plugin version">v{pluginMetadata.info.version}</span></h2></header>
      {compact && <div className="ai-embedded-actions"><button type="button" onClick={startNewConversation} disabled={busy}>New conversation</button><a href={`${config.appSubUrl}/a/ai-assistant-app`} target="_blank" rel="noreferrer">Open full assistant ↗</a></div>}
      <section className="ai-conversation" aria-label="Conversation" aria-live="polite">
        {!messages.length && <div className="ai-welcome">
          <div className="ai-orbit" aria-hidden="true">✦</div>
          <h1>{effectiveViewContext ? 'What should we do with this dashboard?' : 'What would you like to work on?'}</h1>
          <p>{effectiveViewContext ? 'Describe what you want to understand or change. Your selected dashboard will be included.' : 'Attach a dashboard with @, or describe your task. Include the service, data source, or issue you want to focus on.'}</p>
        </div>}
        {messages.filter(m => !(m.checkpoint && progress)).map((m, i) => <article key={i} className={`ai-message ${m.role}`}>
          <div className="ai-message-role">{m.role === 'assistant' ? '✦ AI Assistant' : 'You'}</div>
          {m.plan && <TaskChecklist plan={m.plan} />}
          {m.copyOffer && !busy && i === messages.length - 1 && <button type="button" className="ai-resume" onClick={() => send(`Create a separate modified copy of dashboard UID ${m.copyOffer!.sourceUid}. Keep the original unchanged. Apply this requested change to the copy: ${JSON.stringify(m.copyOffer!.request)}. Use create_dashboard_copy with a new identity and overwrite disabled; respect my destination creation permissions.`)}>Create modified copy</button>}
          {m.plan && !m.copyOffer && !busy && i === messages.length - 1 && m.plan.steps.some(step => step.status !== 'completed' && step.status !== 'skipped' && !step.resolvedBy) && <button type="button" className="ai-resume" onClick={() => send('Continue the unfinished task from the previous checkpoint. Inspect current resources before any mutations; preserve completed work and do not blindly repeat writes.')}>Continue unfinished task</button>}
          {m.steps && m.steps.length > 0 && (
            <details className="ai-steps-details">
              <summary className="ai-steps-summary">
                <span className="ai-steps-title">✦ {m.steps.length} {m.steps.length === 1 ? 'action executed' : 'actions executed'}</span>
                <span className="ai-steps-badge">{m.steps.every(s => s.status === 'completed') ? 'Complete' : 'Notices'}</span>
              </summary>
              <div className="ai-steps-list">
                {m.steps.map(s => (
                  <div key={s.id} className={`ai-step-item ${s.status}`}>
                    <span className={`ai-step-dot ${s.status}`} />
                    <code className="ai-step-name">{s.name}</code>
                    <span className="ai-step-desc">{s.description}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              table: ({ children, ...props }) => (
                <div className="ai-table-wrapper">
                  <table {...props}>{children}</table>
                </div>
              ),
              a: ({ href, children, ...props }) => {
                const rawHref = href || '';
                const normalized = rawHref.startsWith('/') && config.appSubUrl && !rawHref.startsWith(config.appSubUrl)
                  ? `${config.appSubUrl}${rawHref}`
                  : rawHref;
                return (
                  <a href={normalized} target="_blank" rel="noreferrer" {...props}>
                    {children}
                  </a>
                );
              },
              code: ({ className, children, ...props }) => {
                const match = /language-(\w+)/.exec(className || '');
                const isBlock = Boolean(match) || String(children).includes('\n');
                if (!isBlock) {
                  return <code className={className} {...props}>{children}</code>;
                }
                const codeText = String(children).replace(/\n$/, '');
                const lang = match ? match[1] : '';
                const isQuery = /promql|logql|traceql|sql/i.test(lang);
                const exploreUrl = isQuery ? `${config.appSubUrl}/explore` : null;
                return (
                  <div className="ai-code-block">
                    <div className="ai-code-header">
                      <span className="ai-code-lang">{lang || 'snippet'}</span>
                      <div className="ai-code-actions">
                        {exploreUrl && (
                          <a href={exploreUrl} target="_blank" rel="noreferrer" className="ai-code-btn">
                            Explore ↗
                          </a>
                        )}
                        <button
                          type="button"
                          className="ai-code-btn"
                          onClick={() => void navigator.clipboard?.writeText(codeText)}
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                    <pre><code className={className} {...props}>{children}</code></pre>
                  </div>
                );
              },
            }}
          >
            {normalizeMarkdownTables(m.content)}
          </ReactMarkdown>
          {m.dashboards && m.dashboards.length > 0 && (
            <div className="ai-dashboard-cards">
              {m.dashboards.map(dash => {
                const dashUrl = dash.url?.startsWith('/') ? dash.url : `/d/${dash.uid}`;
                const fullUrl = config.appSubUrl && !dashUrl.startsWith(config.appSubUrl)
                  ? `${config.appSubUrl}${dashUrl}`
                  : dashUrl;
                return (
                  <div key={dash.uid} className="ai-dashboard-card">
                    <div className="ai-dashboard-card-main">
                      <span className="ai-dashboard-card-icon">▦</span>
                      <div className="ai-dashboard-card-text">
                        <div className="ai-dashboard-card-title">{dash.title || 'Dashboard'}</div>
                        <div className="ai-dashboard-card-uid">UID: <code>{dash.uid}</code></div>
                      </div>
                    </div>
                    <a href={fullUrl} target="_blank" rel="noreferrer" className="ai-dashboard-card-btn">
                      Open Dashboard ↗
                    </a>
                  </div>
                );
              })}
            </div>
          )}
        </article>)}
        {progress?.plan && <TaskChecklist plan={progress.plan} running />}
        {progress && <WorkingProgress startedAt={progress.startedAt} activity={progress.activity} events={progress.events} />}
        {error && <div className="ai-error" role="alert">{error}<br /><button disabled={busy} onClick={() => { setDraft(messages.filter(m => m.role === 'user').at(-1)?.content || ''); clearRunError(); }}>Edit and retry</button></div>}
        <div ref={bottom} />
      </section>
      <footer>
        <form onSubmit={e => { e.preventDefault(); if (!picker && !sourcePicker) void send(draft); }}>
          {sourcePicker && <DatasourcePicker onSelect={item => { setAttachedDatasource(item); setSourcePicker(false); requestAnimationFrame(() => composer.current?.focus()); }} onClose={() => { setSourcePicker(false); composer.current?.focus(); }} />}
          {picker && <DashboardPicker query={picker.query} onSelect={attachDashboard} onClose={() => { setPicker(null); composer.current?.focus(); }} />}
          {effectiveViewContext && <div className="ai-context-chip" role="status" aria-label="Attached dashboard context">
            <span>Dashboard attached</span><a href={`${config.appSubUrl}/d/${encodeURIComponent(effectiveViewContext.dashboardUid)}`} target="_blank" rel="noreferrer" title={`UID: ${effectiveViewContext.dashboardUid}${effectiveViewContext.panelTitle ? ` · Panel: ${effectiveViewContext.panelTitle}` : ''}${effectiveViewContext.from && effectiveViewContext.to ? ` · ${effectiveViewContext.from} → ${effectiveViewContext.to}` : ''}`}>{effectiveViewContext.dashboardTitle || effectiveViewContext.dashboardUid}</a>
            {effectiveViewContext.panelTitle && <small>· {effectiveViewContext.panelTitle}</small>}
            <button type="button" disabled={busy} aria-label="Remove dashboard context" title="Remove dashboard context" onClick={() => setAttachedDashboard(undefined)}>×</button>
          </div>}
          {attachedDatasource && <div className="ai-context-chip" role="status" aria-label="Attached datasource context"><span>Data source</span><strong title={`UID: ${attachedDatasource.uid}`}>{attachedDatasource.name}</strong><small>{attachedDatasource.type}</small><button type="button" disabled={busy} aria-label="Remove datasource context" onClick={() => setAttachedDatasource(undefined)}>×</button></div>}
          <textarea ref={composer} aria-label="Message to assistant" placeholder="Describe your task… Type @ to attach a dashboard." value={draft} disabled={busy} maxLength={16000} onChange={e => { setDraft(e.target.value); setSourcePicker(false); setPicker(dashboardMention(e.target.value, e.target.selectionStart) || null); }} onKeyDown={e => { if (picker || sourcePicker) { if (e.key === 'Escape') { e.preventDefault(); setPicker(null); setSourcePicker(false); } return; } if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(draft); } }} /><details className="ai-extra-context"><summary>Additional context{context.trim() ? ' · added' : ''}</summary><textarea aria-label="Additional context" placeholder="Optional notes, service names, or investigation details" disabled={busy} value={context} onChange={e => setContext(e.target.value)} /></details><div className="ai-composer-bottom"><button type="button" disabled={busy} onClick={() => { setSourcePicker(false); setPicker({ start: -1, end: -1, query: '' }); }}>@ Dashboard</button><button type="button" className="ai-source-trigger" disabled={busy} onClick={() => { setPicker(null); setSourcePicker(true); }}>＋ Data source</button>{busy ? <button type="button" onClick={stop}>Stop ■</button> : <button type="submit" disabled={!draft.trim() || !!picker || sourcePicker}>Send ↑</button>}</div></form><small>Enter to send · Shift+Enter for a new line · Stop is available while working</small></footer>
    </main>
  </div>;
}
