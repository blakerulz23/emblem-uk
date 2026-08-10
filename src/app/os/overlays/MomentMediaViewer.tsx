'use client';

import { useEffect, useRef, useState } from 'react';
import { onActivateKey } from '../a11y';

/**
 * Full-screen inspection view for a single moment's media — originally
 * built for Coach Verify (so a coach can see the real submitted media
 * clearly before deciding, rather than judging a small thumbnail), now
 * generalised so the same component can later open from Player OS Home,
 * Collection, and the public player profile in read-only `mode="view"`.
 *
 * Deliberately takes no dependency on VerifyItem, CoachVerify, or any
 * verification-specific type — every caller maps its own data into the
 * small MomentMediaItem shape below and, only for `mode="verify"`, supplies
 * the optional approve/reject handlers. Authorization for approve/reject is
 * enforced server-side (POST /api/os/moments/verify, unchanged by this
 * refactor) — omitting the handlers here just omits the buttons, it is not
 * itself a security boundary, and callers must not treat it as one.
 *
 * `position: fixed; inset: 0` (same technique OsApp.tsx already uses for
 * MomentStage/CollectibleViewer/CelebrateSheet) — viewport-anchored
 * regardless of the underlying screen's scroll offset, so opening/closing
 * never touches document scroll position, and it sits above both the
 * screen content and the floating bottom nav (z-index 30/31) without
 * needing any scroll-lock hack.
 *
 * Deliberately NOT a reuse of MomentStage/CollectibleViewer — both are
 * hardcoded to the demo MOMENTS dictionary and a reward-narrative shape
 * (rc.rewards, rc.facts, rc.coach…) that doesn't exist on a real moment,
 * and both are styled as celebratory "you earned this" reveals, not a
 * neutral inspect-this-media tool suited to verification or a plain
 * Home/Collection/public-profile view. CollectibleViewer/openCollectible
 * is confirmed never even wired to real Collection data today
 * (RealCollection.tsx never calls it) — reusing either would mean forcing
 * fake reward data into contexts that have none, or forking their
 * internals beyond recognition.
 */
export type MomentMediaKind = 'image' | 'video';

export type MomentMediaItem = {
  mediaUrl: string;
  mediaKind: MomentMediaKind | null;
  title: string;
  playerName: string;
  /** Pre-formatted for display — the caller decides what belongs here (e.g. Coach Verify includes "Submitted by X ·"), the viewer just renders it as-is. */
  date: string;
  /** Caption/note, if any — omitted or null renders no caption at all. */
  note?: string | null;
  /** e.g. "Coach verified" for a future mode="view" caller. Accepted regardless of mode so a later view-mode caller never needs a second variant of this component. */
  status?: string | null;
};

export type MomentMediaViewerProps = {
  mode: 'view' | 'verify';
  item: MomentMediaItem;
  onClose: () => void;
  /** Verify-only — ignored, and the action row omitted, unless mode === 'verify'. */
  onApprove?: () => void;
  onReject?: () => void;
  isSubmitting?: boolean;
  actionError?: string | null;
  /**
   * Guardian-owned view contexts only (Player OS Home, Collection) —
   * never passed by the public profile's viewer instance, which is also
   * mode="view" but must never offer deletion to a page strangers can
   * reach. Handler presence, not `mode`, is what shows the action — same
   * rule this file already applies to onApprove/onReject, restated here:
   * omitting this prop just omits the affordance, it is not itself an
   * authorization boundary — the real check happens server-side
   * (DELETE /api/os/moments/[id]) regardless of whether this button was
   * ever rendered.
   */
  onDelete?: () => void;
  isDeleting?: boolean;
  deleteError?: string | null;
};

export default function MomentMediaViewer({
  mode,
  item,
  onClose,
  onApprove,
  onReject,
  isSubmitting = false,
  actionError = null,
  onDelete,
  isDeleting = false,
  deleteError = null,
}: MomentMediaViewerProps) {
  const closeButtonRef = useRef<HTMLDivElement>(null);
  const [deleteStep, setDeleteStep] = useState<'idle' | 'menu' | 'confirm'>('idle');
  const canDelete = mode === 'view' && !!onDelete;
  const reducedMotion =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    closeButtonRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Never rendered for mode="view" even if a caller mistakenly passed a
  // handler — mode is the single source of truth for whether this is a
  // decision surface at all, not "did a handler happen to be supplied."
  const showActions = mode === 'verify' && (!!onApprove || !!onReject);

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 45, background: '#0B0A09', display: 'flex', flexDirection: 'column', fontFamily: 'Roboto' }}
      role="dialog"
      aria-modal="true"
      aria-label={`${item.title} — ${item.playerName}`}
    >
      <div
        style={{
          flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain',
          paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          animation: reducedMotion ? 'none' : 'colExpand .3s cubic-bezier(.22,.61,.36,1)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 14px 0', position: 'relative' }}>
          {canDelete && (
            <div style={{ position: 'relative' }}>
              <div
                role="button"
                tabIndex={0}
                aria-label="Moment options"
                aria-haspopup="menu"
                onClick={() => setDeleteStep((s) => (s === 'menu' ? 'idle' : 'menu'))}
                onKeyDown={onActivateKey(() => setDeleteStep((s) => (s === 'menu' ? 'idle' : 'menu')))}
                style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(255,255,255,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
              </div>
              {deleteStep === 'menu' && (
                <div role="menu" style={{ position: 'absolute', top: 44, right: 0, background: '#1C1815', borderRadius: 12, boxShadow: '0 12px 28px -8px rgba(0,0,0,.6)', overflow: 'hidden', minWidth: 160, zIndex: 1 }}>
                  <div
                    role="menuitem"
                    tabIndex={0}
                    onClick={() => setDeleteStep('confirm')}
                    onKeyDown={onActivateKey(() => setDeleteStep('confirm'))}
                    style={{ padding: '12px 16px', fontSize: 13.5, fontWeight: 700, color: '#E8897E', cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    Delete moment
                  </div>
                </div>
              )}
            </div>
          )}
          <div
            ref={closeButtonRef}
            role="button"
            tabIndex={0}
            aria-label="Close"
            onClick={onClose}
            onKeyDown={onActivateKey(onClose)}
            style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(255,255,255,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: '0 0 auto' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" stroke="#fff" strokeWidth={2.4} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </div>
        </div>

        <div style={{ padding: '10px 18px 0', display: 'flex', justifyContent: 'center' }}>
          {item.mediaUrl ? (
            item.mediaKind === 'video' ? (
              <video
                src={item.mediaUrl}
                controls
                playsInline
                // Never autoplay (with or without sound) — playback is
                // opt-in via the native controls, same as any other player.
                style={{ width: '100%', maxWidth: '100%', maxHeight: '55vh', borderRadius: 16, background: '#000' }}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.mediaUrl}
                alt={`Photo for ${item.title}`}
                style={{ width: '100%', maxWidth: '100%', maxHeight: '55vh', objectFit: 'contain', borderRadius: 16, background: '#141210' }}
              />
            )
          ) : (
            <div style={{ width: '100%', maxWidth: 320, aspectRatio: '4 / 3', borderRadius: 16, background: '#141210', border: '1px dashed rgba(255,255,255,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 12.5, color: '#9C948A', textAlign: 'center', padding: '0 20px' }}>No media attached to this moment.</span>
            </div>
          )}
        </div>

        <div style={{ padding: '20px 22px 28px' }}>
          <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 26, lineHeight: 1.05, color: '#F4F1EC', marginBottom: 6, wordBreak: 'break-word' }}>{item.title}</div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#E97435', marginBottom: 4 }}>{item.playerName}</div>
          <div style={{ fontSize: 12, color: '#9C948A', marginBottom: item.note || item.status ? 16 : 22 }}>
            {item.date}
            {item.status ? ` · ${item.status}` : ''}
          </div>
          {item.note && (
            <p style={{ fontSize: 14.5, lineHeight: 1.55, color: '#CFC7B8', margin: '0 0 22px', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{item.note}</p>
          )}

          {showActions && (
            <div style={{ display: 'flex', gap: 9 }}>
              {onApprove && (
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={`Recognise ${item.title} for ${item.playerName}`}
                  onClick={onApprove}
                  onKeyDown={onActivateKey(onApprove)}
                  style={{ flex: 1, textAlign: 'center', padding: 14, borderRadius: 12, background: isSubmitting ? 'rgba(233,116,53,.5)' : '#E97435', color: '#fff', fontFamily: 'Roboto', fontWeight: 800, fontSize: 14, cursor: isSubmitting ? 'default' : 'pointer' }}
                >
                  {isSubmitting ? 'Saving…' : 'Recognize'}
                </div>
              )}
              {onReject && (
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={`Reject ${item.title} for ${item.playerName}`}
                  onClick={onReject}
                  onKeyDown={onActivateKey(onReject)}
                  style={{ flex: onApprove ? '0 0 auto' : 1, textAlign: 'center', padding: onApprove ? '14px 18px' : 14, borderRadius: 12, border: '1px solid rgba(210,60,50,.35)', color: '#E8897E', fontFamily: 'Roboto', fontWeight: 800, fontSize: 14, cursor: isSubmitting ? 'default' : 'pointer' }}
                >
                  Not this time
                </div>
              )}
            </div>
          )}
          {showActions && actionError && <p style={{ fontSize: 12.5, color: '#E8897E', marginTop: 10, textAlign: 'center' }}>{actionError}</p>}
        </div>
      </div>

      {deleteStep === 'confirm' && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 46, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          role="alertdialog"
          aria-modal="true"
          aria-label="Delete this moment permanently?"
        >
          <div style={{ width: '100%', maxWidth: 340, background: '#1C1815', borderRadius: 18, padding: 22 }}>
            <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 19, color: '#F4F1EC', marginBottom: 10 }}>
              Delete this moment permanently?
            </div>
            <p style={{ fontSize: 13.5, lineHeight: 1.55, color: '#CFC7B8', margin: '0 0 20px' }}>
              This removes the moment and its photos or videos from the player&apos;s collection. This cannot be undone.
            </p>
            {deleteError && <p style={{ fontSize: 12.5, color: '#E8897E', margin: '0 0 14px' }}>{deleteError}</p>}
            <div style={{ display: 'flex', gap: 9 }}>
              <div
                role="button"
                tabIndex={0}
                aria-label="Cancel"
                onClick={() => !isDeleting && setDeleteStep('idle')}
                onKeyDown={isDeleting ? undefined : onActivateKey(() => setDeleteStep('idle'))}
                style={{ flex: 1, textAlign: 'center', padding: 13, borderRadius: 12, border: '1px solid rgba(255,255,255,.15)', color: '#F4F1EC', fontFamily: 'Roboto', fontWeight: 700, fontSize: 13.5, cursor: isDeleting ? 'default' : 'pointer' }}
              >
                Cancel
              </div>
              <div
                role="button"
                tabIndex={0}
                aria-label={`Permanently delete ${item.title}`}
                onClick={() => !isDeleting && onDelete && onDelete()}
                onKeyDown={isDeleting ? undefined : onActivateKey(() => onDelete && onDelete())}
                style={{ flex: 1, textAlign: 'center', padding: 13, borderRadius: 12, background: isDeleting ? 'rgba(210,60,50,.4)' : '#C0392B', color: '#fff', fontFamily: 'Roboto', fontWeight: 800, fontSize: 13.5, cursor: isDeleting ? 'default' : 'pointer' }}
              >
                {isDeleting ? 'Deleting…' : 'Delete'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
