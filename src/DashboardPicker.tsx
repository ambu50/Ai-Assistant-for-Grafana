import React, { useEffect, useState } from 'react';
import { getBackendSrv } from '@grafana/runtime';
import { DashboardChoice, findDashboards } from './dashboardSearch';

export function DashboardPicker({ query, onSelect, onClose }: { query: string; onSelect: (dashboard: DashboardChoice) => void; onClose: () => void }) {
  const [items, setItems] = useState<DashboardChoice[]>([]);
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [index, setIndex] = useState(0);
  const [search, setSearch] = useState(query);
  useEffect(() => { setSearch(query); }, [query]);
  useEffect(() => { setPage(1); setItems([]); setIndex(0); }, [search]);
  useEffect(() => {
    let current = true;
    setLoading(true); setError('');
    const timer = setTimeout(() => {
      void findDashboards(search, page, (url, params) => getBackendSrv().get(url, params)).then(results => {
        if (!current) return;
        setItems(prev => page === 1 ? results : [...prev, ...results.filter(d => !prev.some(p => p.uid === d.uid))]);
        setMore(results.length === 100); setLoading(false);
      }).catch(() => { if (current) { setError('Unable to load dashboards. Check your Grafana connection and permissions.'); setLoading(false); } });
    }, 200);
    return () => { current = false; clearTimeout(timer); };
  }, [search, page, retry]);
  return <div className="ai-dashboard-picker" aria-label="Choose dashboard context" onKeyDown={e => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setIndex(i => Math.max(0, Math.min(items.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))); }
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (items[index] && !loading) onSelect(items[index]); }
  }}>
    <div className="ai-dashboard-picker-head"><strong>Attach a dashboard</strong><button type="button" onClick={onClose} aria-label="Close dashboard picker">×</button></div>
    <input autoFocus aria-label="Search dashboards" placeholder="Search dashboard names…" value={search} onChange={e => setSearch(e.target.value)} aria-controls="ai-dashboard-results" aria-activedescendant={items[index] ? `ai-dash-${index}` : undefined} role="combobox" aria-expanded="true" aria-autocomplete="list" />
    {loading && <p role="status">Searching dashboards…</p>}
    {error && <p role="alert">{error} <button type="button" onClick={() => setRetry(p => p + 1)}>Retry</button></p>}
    {!loading && !error && !items.length && <p>No dashboards found.</p>}
    <div role="listbox" id="ai-dashboard-results">{items.map((d, i) => <button type="button" role="option" id={`ai-dash-${i}`} aria-selected={i === index} key={d.uid} onMouseEnter={() => setIndex(i)} onMouseDown={e => {
      // Commit a primary mouse choice before native focus/scroll can move the
      // option between mouse-down and mouse-up. onClick remains for touch/AT.
      if (e.button !== 0) return;
      e.preventDefault();
      onSelect(d);
    }} onClick={() => onSelect(d)}><strong>{d.title}</strong><small>{d.folderTitle || 'General'} · {d.uid}</small></button>)}</div>
    {more && !loading && <button type="button" onClick={() => setPage(p => p + 1)}>Load more dashboards</button>}
  </div>;
}
