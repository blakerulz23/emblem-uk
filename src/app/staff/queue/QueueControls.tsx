'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import QueueSortControl from './QueueSortControl';
import type { QueueSort } from '@/lib/staff-queue-search';

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </svg>
  );
}

function buildQueueUrl(q: string, sort: QueueSort) {
  const params = new URLSearchParams();
  const trimmed = q.trim();
  if (trimmed) params.set('q', trimmed);
  if (sort !== 'newest') params.set('sort', sort);
  const qs = params.toString();
  return qs ? `/staff/queue?${qs}` : '/staff/queue';
}

export default function QueueControls({ initialQuery, initialSort }: { initialQuery: string; initialSort: QueueSort }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [sort, setSort] = useState<QueueSort>(initialSort);
  const [, startTransition] = useTransition();
  const [isPending, setIsPending] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The URL is the source of truth (Back button, the empty-state's "Clear
  // search", a shared link) — resync local state whenever it changes from
  // outside this component instead of only seeding it once on mount.
  useEffect(() => setQuery(initialQuery), [initialQuery]);
  useEffect(() => setSort(initialSort), [initialSort]);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const commit = (nextQ: string, nextSort: QueueSort) => {
    setIsPending(true);
    startTransition(() => {
      router.replace(buildQueueUrl(nextQ, nextSort), { scroll: false });
    });
  };

  // useTransition's own isPending can go stale across the debounce delay
  // (it only tracks the router.replace call itself); a plain flag cleared
  // once the new initialQuery/initialSort props land (i.e. the server
  // re-render committed) is a simpler, accurate "still loading" signal.
  useEffect(() => {
    setIsPending(false);
  }, [initialQuery, initialSort]);

  const onQueryChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => commit(value, sort), 300);
  };

  const onClear = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setQuery('');
    commit('', sort);
  };

  const onSortChange = (nextSort: QueueSort) => {
    setSort(nextSort);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    commit(query, nextSort);
  };

  return (
    <div className="qc-row">
      <div className="qc-search">
        <SearchIcon />
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search player name"
          aria-label="Search queue by player name"
          className="qc-search-input"
        />
        <div className="qc-search-end">
          {isPending && <span className="qc-spinner" aria-hidden="true" />}
          {query.length > 0 && (
            <button type="button" onClick={onClear} aria-label="Clear player search" className="qc-clear-btn">
              <ClearIcon />
            </button>
          )}
        </div>
      </div>
      <QueueSortControl value={sort} onChange={onSortChange} />
      <style>{`
        .qc-row { display: flex; flex-wrap: wrap; align-items: stretch; gap: 10px; margin: 24px 0 4px; }
        .qc-search {
          flex: 1 1 240px; min-width: 200px; height: 48px; display: flex; align-items: center;
          gap: 9px; padding: 0 14px; border-radius: 12px; background: #fff;
          box-shadow: inset 0 0 0 1px var(--line); color: var(--ink-faint);
        }
        .qc-search:focus-within { box-shadow: inset 0 0 0 2px var(--accent); color: var(--ink-soft); }
        .qc-search-input {
          flex: 1; min-width: 0; height: 100%; border: none; outline: none; background: transparent;
          font-family: var(--font-manrope), system-ui; font-size: 14.5px; color: var(--ink);
        }
        .qc-search-input::placeholder { color: var(--ink-faint); }
        .qc-search-end { display: flex; align-items: center; gap: 6px; }
        .qc-clear-btn {
          width: 44px; height: 44px; margin: 0 -12px 0 0; border: none; background: transparent;
          color: var(--ink-soft); cursor: pointer; display: flex; align-items: center; justify-content: center;
          border-radius: 999px; flex-shrink: 0;
        }
        .qc-clear-btn:hover { background: var(--surface); color: var(--ink); }
        .qc-clear-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
        .qc-spinner {
          width: 14px; height: 14px; border-radius: 50%; flex-shrink: 0;
          border: 2px solid var(--line); border-top-color: var(--accent);
          animation: qcSpin .6s linear infinite;
        }
        @keyframes qcSpin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { .qc-spinner { animation: none; opacity: .6; } }
        @media (max-width: 480px) { .qc-search { flex-basis: 100%; } }
      `}</style>
    </div>
  );
}
