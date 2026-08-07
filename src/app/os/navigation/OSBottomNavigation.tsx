'use client';

import { ICN } from '../data';
import type { OsNavItem } from './navItems';

/**
 * Below every full-screen overlay/dialog/bottom-sheet in src/app/os/
 * (MomentStage 40, CollectibleViewer 42, AddMomentFlow 45/48/60,
 * CelebrateSheet/GuardianInviteSheet 46, StoryUpdates 70, the auth/invite
 * gate family 80 — see OsApp.tsx and each overlay component) — chosen once
 * here so the nav/Add button can never accidentally climb above a dialog
 * that opens later. The Add button sits one step above the dock itself
 * (still well below every overlay) so it visually reads as "attached to,
 * rising out of, the dock", not the reverse.
 */
export const OS_BOTTOM_NAV_Z_INDEX = 30;
export const OS_CENTRAL_ACTION_Z_INDEX = 31;

/** How far the Add button's own centre sits above the dock's top edge —
 * tuned so it visually integrates with (overlaps) the dock rather than
 * floating as a fully separate element; re-verified against the dock's
 * real measured height whenever that changes (see os.css's
 * --os-bottom-nav-height / --os-dock-margin-bottom). */
const CENTRAL_ACTION_RISE_ABOVE_DOCK = 26;
const CENTRAL_ACTION_DIAMETER = 60;

const OS_ACCENT = '#E97435';
const OS_INACTIVE = '#8A8378';

export type OsCentralAction = {
  label: string;
  onClick: () => void;
};

export type OsBottomNavigationProps = {
  items: OsNavItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  /** Null/undefined for roles or routes with no central action (e.g. Coach OS today). */
  centralAction?: OsCentralAction | null;
  /**
   * True while a full-screen overlay that needs uninterrupted focus is
   * open (see OsApp.tsx's anyOverlayOpen). Uses visibility, not
   * unmounting: removes the dock from hit-testing *and* the accessibility
   * tree (so keyboard/AT users can't reach it behind the overlay) while
   * preserving layout and avoiding remount/animation churn. z-index alone
   * already keeps overlays visually on top; this additionally guarantees
   * no tap/keyboard activation can reach the dock through them.
   */
  hidden?: boolean;
  /** "Player navigation" / "Coach navigation" — see OsApp.tsx's call site. Falls back to "Primary" only if a caller omits it. */
  ariaLabel?: string;
};

/**
 * The one fixed-positioning implementation shared by Player OS and Coach
 * OS — a floating rounded dock, inspired by Aceternity's FloatingDock
 * (restrained hover magnification, floating-pill silhouette) but built
 * from scratch with plain CSS transforms/transitions, not the original
 * component: that component assumes href-based anchor items, requires
 * framer-motion (not a dependency of this project), and collapses to a
 * single expandable button on mobile — all three are wrong for this
 * product (in-app tab state not links, no reason to add an animation
 * library for a restrained hover effect, and a mobile-first nav that must
 * keep every item and label visible per this feature's own spec). Owns
 * layout/behaviour only — which items/labels/icons/central action to show
 * is supplied by the caller (see navItems.ts); this component makes no
 * role decisions of its own.
 */
export default function OSBottomNavigation({ items, activeKey, onSelect, centralAction = null, hidden = false, ariaLabel = 'Primary' }: OsBottomNavigationProps) {
  return (
    <>
      {centralAction && (
        <button
          type="button"
          className="os-dock-central-action"
          onClick={centralAction.onClick}
          aria-label={centralAction.label}
          tabIndex={hidden ? -1 : 0}
          aria-hidden={hidden || undefined}
          style={{
            position: 'fixed',
            left: '50%',
            bottom: `calc(env(safe-area-inset-bottom, 0px) + var(--os-dock-margin-bottom) + var(--os-bottom-nav-height) - ${CENTRAL_ACTION_RISE_ABOVE_DOCK}px)`,
            transform: 'translateX(-50%)',
            zIndex: OS_CENTRAL_ACTION_Z_INDEX,
            width: CENTRAL_ACTION_DIAMETER,
            height: CENTRAL_ACTION_DIAMETER,
            borderRadius: '50%',
            border: 'none',
            padding: 0,
            margin: 0,
            font: 'inherit',
            background: 'linear-gradient(150deg,#E97435,#C4501C)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: hidden ? 'default' : 'pointer',
            boxShadow: '0 16px 34px -10px rgba(233,116,53,.75),0 4px 10px -4px rgba(0,0,0,.4)',
            visibility: hidden ? 'hidden' : 'visible',
            pointerEvents: hidden ? 'none' : 'auto',
          }}
        >
          <span aria-hidden="true" style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid rgba(233,116,53,.5)', animation: 'actRing 2.4s ease-out infinite' }} />
          <svg width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        </button>
      )}

      <nav
        aria-label={ariaLabel}
        aria-hidden={hidden || undefined}
        style={{
          position: 'fixed',
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + var(--os-dock-margin-bottom))',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'calc(100% - (var(--os-dock-side-margin) * 2))',
          maxWidth: 'calc(var(--os-app-max-width) - (var(--os-dock-side-margin) * 2))',
          height: 'var(--os-bottom-nav-height)',
          zIndex: OS_BOTTOM_NAV_Z_INDEX,
          display: 'flex',
          justifyContent: 'space-around',
          alignItems: 'center',
          padding: '8px 10px',
          borderRadius: 26,
          // Warm, translucent ivory — color-mix keeps this correct in dark
          // mode too, since --os-card already swaps per theme; a flat
          // rgba() literal here would only ever be right for one theme.
          background: 'color-mix(in srgb, var(--os-card) 84%, transparent)',
          backdropFilter: 'blur(20px) saturate(1.5)',
          WebkitBackdropFilter: 'blur(20px) saturate(1.5)',
          border: '1px solid rgba(233,116,53,.15)',
          boxShadow: '0 22px 46px -20px rgba(21,19,15,.4), 0 3px 12px -3px rgba(21,19,15,.12)',
          visibility: hidden ? 'hidden' : 'visible',
          pointerEvents: hidden ? 'none' : 'auto',
        }}
      >
        {items.map((item) => {
          const on = item.key === activeKey;
          const color = on ? OS_ACCENT : OS_INACTIVE;
          return (
            <button
              type="button"
              key={item.key}
              className="os-dock-item"
              onClick={() => onSelect(item.key)}
              aria-label={item.label}
              aria-current={on ? 'page' : undefined}
              tabIndex={hidden ? -1 : 0}
              style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                flex: 1,
                minHeight: 44,
                border: 'none',
                padding: '4px 2px',
                margin: 0,
                font: 'inherit',
                background: 'none',
                cursor: 'pointer',
              }}
            >
              {/* Active-state cue is never colour alone: a rounded highlight
                  behind the icon (shape) + the top marker (position) +
                  orange colour + the label's own font-weight together. */}
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  top: -8,
                  width: 20,
                  height: 3,
                  borderRadius: 3,
                  background: on ? OS_ACCENT : 'transparent',
                }}
              />
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  top: 2,
                  width: 34,
                  height: 34,
                  borderRadius: 12,
                  background: on ? 'rgba(233,116,53,.14)' : 'transparent',
                }}
              />
              <span style={{ position: 'relative' }}>{ICN[item.icon](color)}</span>
              <span style={{ position: 'relative', fontFamily: 'Roboto', fontWeight: on ? 700 : 600, fontSize: 11, color }}>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
