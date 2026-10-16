'use client';

import Link from 'next/link';

/**
 * Strip across the top of every /os/demo screen (adapted from the Canadian
 * repo's DemoBanner). The demo is shown to parents deciding whether to buy,
 * so it must be unmistakable that this is a sample player, not an account,
 * and there must be a way out to the site — and on to ordering — from any
 * screen. Exit sits top-left, where people look for a way back.
 *
 * Rendered only on the public /os/demo route (OsApp's `demo` prop), never on
 * a real /os session, even one that falls back to sample data.
 */
export default function DemoBanner({ isCoach, onToggleRole }: { isCoach: boolean; onToggleRole: () => void }) {
  return (
    <div
      role="note"
      aria-label="Demo with sample data"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
        alignItems: 'center',
        gap: 8,
        padding: '8px 10px',
        paddingTop: 'calc(8px + env(safe-area-inset-top, 0px))',
        background: '#15130F',
        color: '#F4F1EC',
        borderBottom: '1px solid rgba(233,116,53,.35)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <Link
          href="/"
          aria-label="Exit the demo and go back to emblem.cards"
          data-track="demo_exit"
          style={{
            flex: '0 0 auto',
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            minHeight: 32,
            borderRadius: 999,
            padding: '5px 11px 5px 7px',
            border: '1px solid rgba(244,241,236,.22)',
            color: '#D9D1C5',
            fontFamily: 'Roboto, system-ui, sans-serif',
            fontWeight: 700,
            fontSize: 12.5,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
          Exit
        </Link>

        {/* Previewing control (parent vs coach view), moved here from the app's own top bar. */}
        <button
          type="button"
          onClick={onToggleRole}
          aria-label={isCoach ? 'Switch to the parent view' : 'Switch to the coach view'}
          style={{
            flex: '0 0 auto',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            minHeight: 32,
            borderRadius: 999,
            padding: '4px 10px 4px 4px',
            border: '1px solid rgba(244,241,236,.22)',
            background: 'none',
            cursor: 'pointer',
            font: 'inherit',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 19,
              height: 19,
              borderRadius: '50%',
              flex: '0 0 auto',
              background: isCoach ? 'linear-gradient(150deg,#6b6b6b,#2a2a2a)' : 'linear-gradient(150deg,#E9C46A,#C98B3A)',
            }}
          />
          <span style={{ fontFamily: 'Barlow Condensed, system-ui, sans-serif', fontWeight: 700, letterSpacing: '.08em', fontSize: 11, color: '#F4F1EC', textTransform: 'uppercase' }}>
            {isCoach ? 'Coach' : 'Parent'}
          </span>
        </button>
      </div>

      <span
        style={{
          borderRadius: 999,
          padding: '3px 8px',
          border: '1px solid rgba(233,116,53,.5)',
          color: '#F9A36B',
          fontFamily: 'Barlow Condensed, system-ui, sans-serif',
          fontWeight: 700,
          letterSpacing: '.12em',
          fontSize: 10.5,
          whiteSpace: 'nowrap',
        }}
      >
        DEMO
      </span>

      <span style={{ display: 'flex', justifyContent: 'flex-end', minWidth: 0 }}>
        <Link
          href="/builder?mode=single"
          data-track="demo_build"
          style={{
            flex: '0 0 auto',
            display: 'flex',
            alignItems: 'center',
            minHeight: 32,
            borderRadius: 999,
            padding: '6px 13px',
            background: '#E97435',
            border: '1px solid #F2A06B',
            color: '#15130F',
            fontFamily: 'Roboto, system-ui, sans-serif',
            fontWeight: 800,
            fontSize: 12.5,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          Build my card
        </Link>
      </span>
    </div>
  );
}
