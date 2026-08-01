'use client';

import { onActivateKey } from '../a11y';
import type { StoryUpdate } from '../osData';

/** "2 minutes ago" / "3 hours ago" / "15 Aug" — never a raw ISO string. */
export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** "Read Assessment" / "View Recognition" / etc. — matches the destination, never a generic "View". */
const ACTION_LABEL: Record<StoryUpdate['eventType'], string> = {
  assessment_shared: 'Read Assessment',
  recognition: 'View Recognition',
  moment_verified: 'View Memory',
  moment_uploaded: 'View Memory',
  verification_required: 'Verify',
  season_focus_added: 'View Focus',
  coach_connected: 'View Player',
  guardian_connected: 'View Player',
  coach_removed: 'View Connections',
};

function SpeechBubbleIcon(c: string) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8A2.5 2.5 0 0 1 17.5 16H10l-4.5 4v-4H6.5A2.5 2.5 0 0 1 4 13.5z" />
    </svg>
  );
}
function StarIcon(c: string) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={c}>
      <path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 18.3 5.9 20.4 7.3 13.6 2.2 8.9l6.9-.8z" />
    </svg>
  );
}
function PhotoIcon(c: string) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="9" cy="9" r="2" /><path d="M21 15l-5-5L5 21" />
    </svg>
  );
}
function ShieldIcon(c: string) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l7 3v6c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V5z" /><path d="M9 12l2 2 4-4" />
    </svg>
  );
}
function TargetIcon(c: string) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.8}>
      <circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4.2" /><circle cx="12" cy="12" r="1" fill={c} stroke="none" />
    </svg>
  );
}
function LinkIcon(c: string) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.8}>
      <circle cx="9" cy="12" r="6" opacity={0.55} /><circle cx="15" cy="12" r="6" opacity={0.85} />
    </svg>
  );
}

const ICON_BY_EVENT: Record<StoryUpdate['eventType'], (c: string) => JSX.Element> = {
  assessment_shared: SpeechBubbleIcon,
  recognition: StarIcon,
  moment_verified: PhotoIcon,
  moment_uploaded: PhotoIcon,
  verification_required: ShieldIcon,
  season_focus_added: TargetIcon,
  coach_connected: LinkIcon,
  guardian_connected: LinkIcon,
  coach_removed: LinkIcon,
};

/** "Coach Assessment" style eyebrow — the category label shown per card, matching the product spec's examples. */
const CATEGORY_EYEBROW: Record<string, string> = {
  coach: 'COACH',
  collection: 'COLLECTION',
  family: 'FAMILY',
};

/**
 * One component, three deliberately different visual treatments keyed by
 * category — coach reads personal/quiet, collection reads collectible
 * (echoing RealCollection.tsx's recognized/milestone card treatment),
 * family reads warmer. Unread gets a colored accent border; read goes
 * muted. Tapping only calls onOpen — this card never navigates itself.
 */
export default function StoryUpdateCard({ update, onOpen }: { update: StoryUpdate; onOpen: (update: StoryUpdate) => void }) {
  const isUnread = !update.readAt;
  const Icon = ICON_BY_EVENT[update.eventType];

  const palette = isUnread
    ? update.category === 'collection'
      ? { accent: '#E9A03B', iconBg: 'rgba(233,160,59,.14)', border: '1.5px solid rgba(233,160,59,.45)', shadow: '0 10px 26px -14px rgba(233,160,59,.4)' }
      : update.category === 'family'
        ? { accent: '#E97435', iconBg: 'rgba(233,116,53,.12)', border: '1.5px solid rgba(233,116,53,.35)', shadow: '0 8px 22px -16px rgba(233,116,53,.3)' }
        : { accent: '#6B6357', iconBg: 'rgba(107,99,87,.1)', border: '1px solid var(--os-border)', shadow: '0 6px 18px -14px rgba(0,0,0,.18)' }
    : { accent: 'var(--os-border)', iconBg: 'rgba(107,99,87,.08)', border: '1px solid var(--os-border)', shadow: 'none' };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(update)}
      onKeyDown={onActivateKey(() => onOpen(update))}
      style={{
        display: 'flex',
        gap: 12,
        padding: 14,
        borderRadius: 16,
        cursor: 'pointer',
        background: isUnread ? 'var(--os-card)' : 'rgba(0,0,0,.015)',
        border: palette.border,
        borderLeft: isUnread ? `3px solid ${palette.accent}` : palette.border,
        boxShadow: palette.shadow,
        marginBottom: 10,
        opacity: isUnread ? 1 : 0.7,
        transition: 'opacity .3s ease',
        animation: 'faceIn .3s ease',
      }}
    >
      <div style={{ width: 36, height: 36, borderRadius: 10, background: palette.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
        {Icon(isUnread ? palette.accent : '#8A8378')}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.08em', fontSize: 10.5, color: 'var(--os-muted)', marginBottom: 3 }}>
          {CATEGORY_EYEBROW[update.category]} · {update.title}
        </div>
        <div style={{ fontFamily: 'Roboto', fontWeight: isUnread ? 800 : 600, fontSize: 13.5, color: isUnread ? 'var(--os-ink)' : 'var(--os-muted)', lineHeight: 1.4, marginBottom: 4 }}>
          {update.body}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 11.5, color: 'var(--os-muted)' }}>{formatRelativeTime(update.createdAt)}</span>
          <span style={{ fontFamily: 'Roboto', fontWeight: 700, fontSize: 12, color: isUnread ? '#E97435' : 'var(--os-muted)' }}>{ACTION_LABEL[update.eventType]}</span>
        </div>
      </div>
    </div>
  );
}
