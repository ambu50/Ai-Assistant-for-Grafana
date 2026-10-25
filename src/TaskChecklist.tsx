import React, { useEffect, useState } from 'react';
import type { TaskPlan } from './planning';

export function TaskChecklist({ plan, running = false }: { plan: TaskPlan; running?: boolean }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);
  const symbols = { pending: '○', running: '◌', completed: '✓', failed: '✕', blocked: '⊘', skipped: '–' };
  return <section className="ai-plan" aria-label="Task plan">
    <div className="ai-plan-heading"><strong>Task plan</strong><span>{plan.steps.filter(s => s.status === 'completed' || s.resolvedBy).length}/{plan.steps.length} complete</span></div>
    <p>{plan.summary}</p>
    <ol>{plan.steps.map(step => <li key={step.id} className={`ai-plan-step ${step.resolvedBy ? 'completed' : step.status}`}>
      <div><span aria-hidden="true">{step.resolvedBy ? '✓' : symbols[step.status]}</span> <strong>{step.description}</strong><small>{step.resolvedBy ? `recovered by ${step.resolvedBy}` : !running && step.status === 'running' ? 'interrupted' : step.status}{step.startedAt ? ` · ${Math.max(0, Math.floor(((step.finishedAt ?? (running ? now : step.startedAt)) - step.startedAt) / 1000))}s` : ''}</small></div>
      {step.outcome && <p>{step.outcome}</p>}
      {plan.actions.some(a => a.stepId === step.id) && <details><summary>Tool activity</summary><ul>{plan.actions.filter(a => a.stepId === step.id).map(action => <li key={action.id}><code>{action.name}</code> · {action.expectedFailure ? 'expected diagnostic error' : action.status}{action.error && <p>{action.error}</p>}</li>)}</ul></details>}
    </li>)}</ol>
    {(plan.queries.length > 0 || plan.dashboards.length > 0) && <details><summary>Evidence and verification</summary>
      {plan.queries.map((query, i) => <p key={i}><code>{query.expression}</code> · {query.datasource || 'datasource unspecified'} · {query.status} · data {query.data}</p>)}
      {plan.dashboards.map(dashboard => <p key={dashboard.uid}><code>{dashboard.uid}</code> · {dashboard.status}: {dashboard.detail}</p>)}
    </details>}
  </section>;
}
