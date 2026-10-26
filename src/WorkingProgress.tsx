import React, { useEffect, useState } from 'react';

export function WorkingProgress({ startedAt, activity, events }: {
  startedAt: number;
  activity: string;
  events: Array<{ text: string; at: number }>;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const elapsed = Math.max(0, Math.floor((now - startedAt) / 1000));
  const waiting = activity.startsWith('Waiting for model');

  return <section className="ai-working" aria-label="Task progress">
    <div className="ai-working-heading">
      <strong><span className="ai-working-dot" aria-hidden="true" /> Working</strong>
      <span className="ai-working-time" aria-label="Elapsed time">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')} elapsed</span>
    </div>
    <div role="status" aria-live="polite">{activity || 'Connecting to Grafana LLM…'}</div>
    <div className="ai-working-track" aria-hidden="true"><span /></div>
    {waiting && <p>{elapsed >= 30
      ? 'This request is taking longer. Waiting for the provider to respond; you can stop at any time.'
      : 'Response time depends on the configured provider and task. Progress updates appear as each step runs.'}</p>}
    {events.length > 0 && <details><summary>Activity · {events.length} updates</summary>
      <ol>{events.map((event, index) => <li key={index}>
        <time>{Math.max(0, Math.floor((event.at - startedAt) / 1000))}s</time> {event.text}
      </li>)}</ol>
    </details>}
  </section>;
}
