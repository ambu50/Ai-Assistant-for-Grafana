import React from 'react';
import { config } from '@grafana/runtime';

/** Render fenced Markdown code without nesting a block container inside a pre. */
export function MarkdownCodeBlock({ children }: { children?: React.ReactNode }) {
  const element = React.Children.toArray(children).find(child => React.isValidElement(child));
  const code = React.isValidElement<{ className?: string; children?: React.ReactNode }>(element) ? element.props : {};
  const text = String(code.children ?? '').replace(/\n$/, '');
  const language = /language-([^\s]+)/.exec(code.className || '')?.[1] || '';
  const query = /^(promql|logql|traceql|sql)$/i.test(language);
  return <div className="ai-code-block">
    <div className="ai-code-header">
      <span className="ai-code-lang">{language || 'snippet'}</span>
      <div className="ai-code-actions">
        {query && <a href={`${config.appSubUrl}/explore`} target="_blank" rel="noreferrer" className="ai-code-btn">Explore ↗</a>}
        <button type="button" className="ai-code-btn" onClick={() => void navigator.clipboard?.writeText(text)}>Copy</button>
      </div>
    </div>
    <pre><code className={code.className}>{code.children}</code></pre>
  </div>;
}
