'use client';

import { ICN } from '../data';
import { onActivateKey } from '../a11y';
import type { OsNavItem } from './navItems';

/**
 * Below every full-screen overlay/dialog/bottom-sheet in src/app/os/
 * (MomentStage 40, CollectibleViewer 42, AddMomentFlow 45/48/60,
 * CelebrateSheet/GuardianInviteSheet 46, StoryUpdates 70, the auth/invite
 * gate family 80 — see OsApp.tsx and each overlay component) — chosen once
 * here so the nav/Add button can never accidentally climb above a dialog
 * that opens later. The Add button sits one step above the bar itself
 * (still well below every overlay) so it visually reads as "attached to,
 * sitting on top of, the nav bar", not the reverse.
 */
export const OS_BOTTOM_NAV_Z_INDEX = 30;
export const OS_CENTRAL_ACTION_Z_INDEX = 31;

/** Unchanged from the pre-fixed design — the Add button's own offset from
 * the app column's bottom edge, tuned so it sits partially above the nav
 * bar (see os.css's --os-bottom-nav-height for the bar's own height). */
const CENTRAL_ACTION_BOTTOM_OFFSET = 80;
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
   * unmounting: removes the bar from hit-testing *and* the accessibility
   * tree (so keyboard/AT users can't reach it behind the overlay) while
   * preserving layout and avoiding remount/animation churn. z-index alone
   * already keeps overlays visually on top; this additionally guarantees
   * no tap/keyboard activation can reach the nav through them.
   */
  hidden?: boolean;
};

/**
 * The one fixed-positioning implementation shared by Player OS and Coach
 * OS — owns layout (position, safe-area, z-index, responsive width,
 * hide-during-overlay) only. Which items/labels/icons/central action to
 * show is supplied by the caller (see navItems.ts) — this component makes
 * no role decisions of its own.
 */
export default function OSBottomNavigation({ items, activeKey, onSelect, centralAction = null, hidden = false }: OsBottomNavigationProps) {
  return (
    <>
      {centralAction && (
        <div
          onClick={centralAction.onClick}
          role="button"
          aria-label={centralAction.label}
          tabIndex={hidden ? -1 : 0}
          aria-hidden={hidden || undefined}
          onKeyDown={onActivateKey(centralAction.onClick)}
          style={{
            position: 'fixed',
            left: '50%',
            bottom: CENTRAL_ACTION_BOTTOM_OFFSET,
            transform: 'translateX(-50%)',
            zIndex: OS_CENTRAL_ACTION_Z_INDEX,
            width: CENTRAL_ACTION_DIAMETER,
            height: CENTRAL_ACTION_DIAMETER,
            borderRadius: '50%',
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
        </div>
      )}

      <div
        role="navigation"
        aria-label="Primary"
        aria-hidden={hidden || undefined}
        style={{
          position: 'fixed',
          bottom: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '100%',
          maxWidth: 'var(--os-app-max-width)',
          zIndex: OS_BOTTOM_NAV_Z_INDEX,
          display: 'flex',
          justifyContent: 'space-around',
          alignItems: 'center',
          padding: '10px 14px calc(8px + env(safe-area-inset-bottom, 0px))',
          background: 'var(--os-card)',
          borderTop: '1px solid var(--os-border)',
          boxShadow: '0 -6px 20px -14px rgba(0,0,0,.2)',
          visibility: hidden ? 'hidden' : 'visible',
          pointerEvents: hidden ? 'none' : 'auto',
        }}
      >
        {items.map((item) => {
          const on = item.key === activeKey;
          const color = on ? OS_ACCENT : OS_INACTIVE;
          return (
            <div
              key={item.key}
              onClick={() => onSelect(item.key)}
              role="button"
              aria-label={item.label}
              aria-current={on ? 'page' : undefined}
              tabIndex={hidden ? -1 : 0}
              onKeyDown={onActivateKey(() => onSelect(item.key))}
              style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, cursor: 'pointer', flex: 1, minHeight: 44, justifyContent: 'center' }}
            >
              {/* Active indicator — colour is never the only cue: aria-current plus the underline/label-colour pairing together mark the active tab. */}
              <span aria-hidden="true" style={{ position: 'absolute', top: -10, width: 22, height: 3, borderRadius: 3, background: on ? OS_ACCENT : 'transparent' }} />
              {ICN[item.icon](color)}
              <span style={{ fontFamily: 'Roboto', fontWeight: 600, fontSize: 11, color }}>{item.label}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}
