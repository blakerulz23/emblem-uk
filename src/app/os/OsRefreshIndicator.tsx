'use client';

import type { OsRefreshStatus } from './useOsRefresh';

const OS_ACCENT = '#E97435';

const STATUS_LABEL: Record<OsRefreshStatus, string> = {
  idle: '',
  pulling: 'Pull to refresh',
  ready: 'Release to refresh',
  refreshing: 'Checking for updates…',
  success: 'Up to date',
  error: "Couldn't refresh — try again",
};

function RefreshGlyph({ status, progress }: { status: OsRefreshStatus; progress: number }) {
  if (status === 'success') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={OS_ACCENT} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 6L9 17l-5-5" />
      </svg>
    );
  }
  if (status === 'error') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C0392B" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 8v5M12 16.5v.01" />
        <circle cx="12" cy="12" r="9" />
      </svg>
    );
  }
  // pulling / ready / refreshing all share the same circular-arrow glyph —
  // pulling/ready rotate it proportionally to pull progress (a plain inline
  // transform, tracking the live drag 1:1 with no CSS animation involved);
  // refreshing hands rotation off to the continuous CSS keyframe instead
  // (see os.css's os-refresh-spin, itself gated behind
  // prefers-reduced-motion so this never spins for a user who's asked for
  // less motion — it just sits static while "Checking for updates…" is
  // visible, which still reads as a real busy state via the text alone).
  const rotation = status === 'refreshing' ? undefined : progress * 360;
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke={status === 'ready' ? OS_ACCENT : '#8A8378'}
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={status === 'refreshing' ? 'os-refresh-spin' : undefined}
      style={rotation !== undefined ? { transform: `rotate(${rotation}deg)` } : undefined}
    >
      <path d="M3 12a9 9 0 0 1 15.5-6.2M21 12a9 9 0 0 1-15.5 6.2" />
      <path d="M17 4v4.5h-4.5M7 20v-4.5h4.5" />
    </svg>
  );
}

/**
 * The visual reveal for the pull-to-refresh gesture only — the header's
 * manual "Refresh updates" button (OsApp.tsx) shares the same status
 * machine (useOsRefresh) but renders its own small inline spin/checkmark
 * rather than this banner, since there's no drag to visually "reveal" it
 * from. Purely presentational: OsApp.tsx supplies status/pullDistance/
 * progress/onRetry, this component makes no data or gesture decisions.
 */
export default function OsRefreshIndicator({
  status,
  pullDistance,
  progress,
  onRetry,
}: {
  status: OsRefreshStatus;
  pullDistance: number;
  progress: number;
  onRetry: () => void;
}) {
  const visible = pullDistance > 0;
  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: Math.max(pullDistance, 0),
        overflow: 'hidden',
        display: visible ? 'flex' : 'none',
        alignItems: 'flex-end',
        justifyContent: 'center',
        paddingBottom: 10,
        // No transition while the user's finger is actively dragging
        // (pulling/ready — must track 1:1 with the touch, any transition
        // lag would read as laggy/wrong) — only animates the snap-back to
        // 0 (idle) or the settle-to-resting-height (refreshing/error),
        // both of which happen without an active touch on screen.
        transition: status === 'pulling' || status === 'ready' ? 'none' : 'height .28s ease',
        pointerEvents: status === 'error' ? 'auto' : 'none',
      }}
      onClick={status === 'error' ? onRetry : undefined}
      role={status === 'error' ? 'button' : undefined}
      tabIndex={status === 'error' ? 0 : undefined}
      aria-label={status === 'error' ? `${STATUS_LABEL.error} — retry` : undefined}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'color-mix(in srgb, var(--os-card) 92%, transparent)',
          border: `1px solid ${status === 'error' ? 'rgba(192,57,43,.25)' : 'rgba(233,116,53,.16)'}`,
          borderRadius: 999,
          padding: '7px 14px',
          boxShadow: '0 8px 20px -12px rgba(21,19,15,.3)',
          cursor: status === 'error' ? 'pointer' : 'default',
        }}
      >
        <RefreshGlyph status={status} progress={progress} />
        <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.04em', fontSize: 12.5, color: status === 'error' ? '#C0392B' : status === 'ready' ? OS_ACCENT : 'var(--os-ink)' }}>
          {STATUS_LABEL[status] || ' '}
        </span>
      </div>
    </div>
  );
}
