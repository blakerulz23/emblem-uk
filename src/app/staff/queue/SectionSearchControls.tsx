'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import SectionSortControl from './SectionSortControl';
import { buildStaffQueueUrl } from '@/lib/staff-queue-search';

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

/**
 * The search input + sort trigger row for one /staff/queue section.
 * `paramPrefix` ('approval' | 'approved' | 'setup') scopes every URL key
 * this component touches (`${paramPrefix}Q`/`${paramPrefix}Sort`/
 * `${paramPrefix}Page`) — every other param on the page (the other two
 * sections' state) passes through untouched via buildStaffQueueUrl, which
 * is how the three sections stay independent while sharing one URL.
 */
export default function SectionSearchControls({
  paramPrefix,
  placeholder,
  searchAriaLabel,
  initialQuery,
  initialSort,
  defaultSort,
  sortOptions,
}: {
  paramPrefix: string;
  placeholder: string;
  searchAriaLabel: string;
  initialQuery: string;
  initialSort: string;
  defaultSort: string;
  sortOptions: { value: string; label: string }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(initialQuery);
  const [sort, setSort] = useState(initialSort);
  const [isPending, setIsPending] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const qKey = `${paramPrefix}Q`;
  const sortKey = `${paramPrefix}Sort`;
  const pageKey = `${paramPrefix}Page`;

  // The URL is the source of truth (Back button, another section's empty
  // state clearing THIS section indirectly is impossible by design, but a
  // shared link or Back button can still change it) — resync local state
  // whenever it changes from outside this component.
  useEffect(() => setQuery(initialQuery), [initialQuery]);
  useEffect(() => setSort(initialSort), [initialSort]);
  useEffect(() => setIsPending(false), [initialQuery, initialSort]);
  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const commit = (updates: Record<string, string | null>) => {
    setIsPending(true);
    router.replace(buildStaffQueueUrl(searchParams, updates), { scroll: false });
  };

  const onQueryChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      commit({ [qKey]: value.trim() || null, [pageKey]: null });
    }, 300);
  };

  const onClear = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setQuery('');
    commit({ [qKey]: null, [pageKey]: null });
  };

  const onSortChange = (nextSort: string) => {
    setSort(nextSort);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    commit({ [sortKey]: nextSort === defaultSort ? null : nextSort, [pageKey]: null });
  };

  return (
    <div className="qc-row">
      <div className="qc-search">
        <SearchIcon />
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={placeholder}
          aria-label={searchAriaLabel}
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
      <SectionSortControl idPrefix={paramPrefix} value={sort} options={sortOptions} onChange={onSortChange} />
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
