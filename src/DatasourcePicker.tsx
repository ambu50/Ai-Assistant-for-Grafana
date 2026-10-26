import React, { useEffect, useState } from 'react';
import { getBackendSrv } from '@grafana/runtime';
import { datasourceContext, DatasourceContext, matchingDatasources } from './datasourceContext';

export function DatasourcePicker({ onSelect, onClose }: { onSelect: (item: DatasourceContext) => void; onClose: () => void }) {
  const [items, setItems] = useState<DatasourceContext[]>([]);
  const [search, setSearch] = useState('');
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let current = true;
    setLoading(true); setError('');
    void getBackendSrv().get<unknown[]>('/api/datasources').then(result => {
      if (current) { setItems(result.map(datasourceContext).filter((d): d is DatasourceContext => !!d)); setLoading(false); }
    }).catch(() => { if (current) { setError('Unable to load data sources. Check your Grafana connection and permissions.'); setLoading(false); } });
    return () => { current = false; };
  }, [retry]);
  const results = matchingDatasources(items, search);
  return <div className="ai-dashboard-picker" aria-label="Choose datasource context" onKeyDown={e => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setIndex(i => Math.max(0, Math.min(results.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))); }
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (results[index] && !loading && !error) onSelect(results[index]); }
  }}>
    <div className="ai-dashboard-picker-head"><strong>Attach a data source</strong><button type="button" aria-label="Close datasource picker" onClick={onClose}>×</button></div>
    <input autoFocus role="combobox" aria-label="Search data sources" aria-expanded="true" aria-autocomplete="list" aria-controls="ai-datasource-results" aria-activedescendant={results[index] ? `ai-source-${index}` : undefined} placeholder="Search by name or type…" value={search} onChange={e => { setSearch(e.target.value); setIndex(0); }} />
    {loading && <p role="status">Loading data sources…</p>}
    {error && <p role="alert">{error} <button type="button" onClick={() => setRetry(n => n + 1)}>Retry</button></p>}
    {!loading && !error && !results.length && <p>No data sources found.</p>}
    <div role="listbox" id="ai-datasource-results">{!loading && !error && results.map((item, i) => <button type="button" role="option" id={`ai-source-${i}`} key={item.uid} aria-selected={i === index} onMouseEnter={() => setIndex(i)} onMouseDown={e => { if (e.button === 0) { e.preventDefault(); onSelect(item); } }} onClick={() => onSelect(item)}><strong>{item.name}</strong><small>{item.type} · {item.uid}</small></button>)}</div>
  </div>;
}
