'use client';

import { useEffect, useRef, useState } from 'react';

type SortOption = { value: string; label: string };

function SortIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 8h12" />
      <path d="M8 14h8" />
      <path d="M10 20h4" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 9l7 7 7-7" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12.5l5 5L20 6.5" />
    </svg>
  );
}

/**
 * One trigger + option list serves both layouts: on desktop it's an
 * anchored dropdown, on mobile the exact same markup becomes a fixed
 * bottom sheet via CSS media queries only (see the <style> block below) —
 * no JS breakpoint branching in render, avoiding the hydration-mismatch
 * class of bug elsewhere in this codebase. Generic over `options`/`value`
 * so all three /staff/queue sections reuse this one component with their
 * own sort vocabulary; `idPrefix` keeps the three simultaneous instances'
 * DOM ids from colliding.
 */
export default function SectionSortControl({
  idPrefix,
  value,
  options,
  onChange,
}: {
  idPrefix: string;
  value: string;
  options: SortOption[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listboxId = `${idPrefix}-sort-listbox`;

  const focusOption = (index: number) => {
    const el = listRef.current?.querySelectorAll<HTMLElement>('[role="option"]')[index];
    el?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const idx = Math.max(0, options.findIndex((o) => o.value === value));
    setActiveIndex(idx);
    const id = requestAnimationFrame(() => focusOption(idx));
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (listRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const select = (v: string) => {
    onChange(v);
    close();
  };

  const onListKeyDown = (e: React.KeyboardEvent<HTMLUListElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      const next = (activeIndex + dir + options.length) % options.length;
      setActiveIndex(next);
      focusOption(next);
      return;
    }
    if (e.key === 'Home') {
      e.preventDefault();
      setActiveIndex(0);
      focusOption(0);
      return;
    }
    if (e.key === 'End') {
      e.preventDefault();
      setActiveIndex(options.length - 1);
      focusOption(options.length - 1);
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      select(options[activeIndex].value);
      return;
    }
    if (e.key === 'Tab') {
      // Desktop dropdown: let Tab leave normally (Escape/selection is how
      // it's meant to close). Mobile sheet: trap focus inside per spec.
      const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
      if (!isMobile) return;
      e.preventDefault();
      const dir = e.shiftKey ? -1 : 1;
      const next = (activeIndex + dir + options.length) % options.length;
      setActiveIndex(next);
      focusOption(next);
    }
  };

  const current = options.find((o) => o.value === value) ?? options[0];

  return (
    <div className="qsort">
      <button
        type="button"
        ref={triggerRef}
        className="qsort-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => setOpen((o) => !o)}
      >
        <SortIcon />
        <span aria-live="polite">{current.label}</span>
        <ChevronIcon />
      </button>
      {open && (
        <>
          <div className="qsort-backdrop" onClick={close} />
          <div className="qsort-panel">
            <div className="qsort-handle" aria-hidden="true" />
            <div className="qsort-sheet-title">Sort queue</div>
            <ul id={listboxId} role="listbox" aria-label="Sort queue" ref={listRef} onKeyDown={onListKeyDown}>
              {options.map((o, i) => (
                <li
                  key={o.value}
                  role="option"
                  aria-selected={o.value === value}
                  tabIndex={i === activeIndex ? 0 : -1}
                  onClick={() => select(o.value)}
                  onFocus={() => setActiveIndex(i)}
                  className="qsort-option"
                >
                  <span>{o.label}</span>
                  {o.value === value && <CheckIcon />}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
      <style>{`
        .qsort { position: relative; }
        .qsort-trigger {
          height: 48px; padding: 0 16px; border-radius: 12px; border: none;
          background: #fff; box-shadow: inset 0 0 0 1px var(--line);
          display: flex; align-items: center; gap: 8px; white-space: nowrap;
          font-family: var(--font-sora), system-ui; font-weight: 700; font-size: 13px;
          color: var(--ink); cursor: pointer;
        }
        .qsort-trigger:hover { box-shadow: inset 0 0 0 1px var(--ink-faint); }
        .qsort-trigger:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        .qsort-backdrop { display: none; }
        .qsort-panel {
          position: absolute; top: calc(100% + 8px); right: 0; z-index: 30;
          min-width: 220px; padding: 8px; border-radius: 14px; background: #fff;
          box-shadow: inset 0 0 0 1px var(--line), 0 12px 32px rgba(0,0,0,.14);
          animation: qsortFade 120ms ease-out;
        }
        .qsort-handle, .qsort-sheet-title { display: none; }
        .qsort-panel ul { list-style: none; margin: 0; padding: 0; }
        .qsort-option {
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          padding: 11px 12px; border-radius: 10px; cursor: pointer;
          font-family: var(--font-manrope), system-ui; font-size: 14px; color: var(--ink);
        }
        .qsort-option[aria-selected="true"] { background: var(--accent-tint); color: var(--accent); font-weight: 600; }
        .qsort-option:hover { background: var(--surface); }
        .qsort-option[aria-selected="true"]:hover { background: var(--accent-tint); }
        .qsort-option:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
        .qsort-option svg { color: var(--accent); flex-shrink: 0; }
        @keyframes qsortFade { from { opacity: 0; } to { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .qsort-panel { animation: none; } }

        @media (max-width: 767px) {
          .qsort-backdrop {
            display: block; position: fixed; inset: 0; background: rgba(11,11,15,.4); z-index: 40;
          }
          .qsort-panel {
            position: fixed; left: 0; right: 0; bottom: 0; top: auto; z-index: 41;
            min-width: 0; border-radius: 20px 20px 0 0;
            padding: 10px 16px calc(16px + env(safe-area-inset-bottom));
            max-height: 70vh; overflow-y: auto;
            box-shadow: 0 -8px 32px rgba(0,0,0,.18);
          }
          .qsort-handle {
            display: block; width: 36px; height: 4px; border-radius: 999px;
            background: var(--line); margin: 2px auto 12px;
          }
          .qsort-sheet-title {
            display: block; font-family: var(--font-sora), system-ui; font-weight: 800;
            font-size: 16px; color: var(--ink); padding: 0 4px 12px;
          }
          .qsort-option { padding: 14px 12px; font-size: 15px; }
        }
      `}</style>
    </div>
  );
}
