'use client';

import { useMemo, useState } from 'react';
import { onActivateKey } from '../a11y';
import StoryUpdateChips from './StoryUpdateChips';
import type { StoryUpdateFilter } from './StoryUpdateChips';
import StoryUpdateCard from './StoryUpdateCard';
import type { StoryUpdate } from '../osData';

type RecencyGroup = { label: 'Today' | 'Yesterday' | 'Earlier'; items: StoryUpdate[] };

/** Buckets by local-midnight boundaries — mirrors RealCollection.tsx's groupBySeason reasoning (consecutive same-bucket entries, no extra sort needed since updates already arrive newest-first). */
function groupByRecency(updates: StoryUpdate[]): RecencyGroup[] {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86_400_000;

  const today: StoryUpdate[] = [];
  const yesterday: StoryUpdate[] = [];
  const earlier: StoryUpdate[] = [];
  updates.forEach((u) => {
    const t = new Date(u.createdAt).getTime();
    if (t >= startOfToday) today.push(u);
    else if (t >= startOfYesterday) yesterday.push(u);
    else earlier.push(u);
  });

  const groups: RecencyGroup[] = [];
  if (today.length) groups.push({ label: 'Today', items: today });
  if (yesterday.length) groups.push({ label: 'Yesterday', items: yesterday });
  if (earlier.length) groups.push({ label: 'Earlier', items: earlier });
  return groups;
}

/**
 * The Story Updates centre — a full-screen overlay (not MomentStage's dark
 * immersive treatment; this is a scrollable filtered list), sibling to
 * {state.celeb && <CelebrateSheet/>} in OsApp.tsx. Deliberately reads no
 * data of its own: `updates` is passed in from useStoryUpdates(), `onOpen`
 * is wired to the composite deep-link action in Milestone 5.
 */
export default function StoryUpdates({
  updates,
  onOpen,
  onClose,
}: {
  updates: StoryUpdate[];
  onOpen: (update: StoryUpdate) => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState<StoryUpdateFilter>('all');

  const filtered = useMemo(() => {
    if (filter === 'all') return updates;
    if (filter === 'unread') return updates.filter((u) => !u.readAt);
    return updates.filter((u) => u.category === filter);
  }, [updates, filter]);

  const groups = useMemo(() => groupByRecency(filtered), [filtered]);

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 70, background: 'var(--os-screen)', display: 'flex', flexDirection: 'column', animation: 'faceIn .3s ease' }}>
      <div style={{ flex: '0 0 auto', padding: '18px 20px 4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 20, color: 'var(--os-ink)' }}>Story Updates</span>
          <div
            onClick={onClose}
            role="button"
            tabIndex={0}
            aria-label="Close Story Updates"
            onKeyDown={onActivateKey(onClose)}
            style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--os-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: '0 0 auto' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--os-muted)', marginBottom: 16 }}>Everything that&apos;s happened in your football journey.</div>
        <StoryUpdateChips active={filter} onChange={setFilter} />
      </div>

      <div style={{ flex: '1 1 auto', overflowY: 'auto', padding: '0 20px 24px' }}>
        {groups.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--os-muted)', fontSize: 13.5 }}>
            {filter === 'unread' ? "You're all caught up." : 'Nothing here yet.'}
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.label} style={{ marginBottom: 18 }}>
              <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.1em', fontSize: 11.5, color: 'var(--os-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
                {group.label}
              </div>
              {group.items.map((update) => (
                <StoryUpdateCard key={update.id} update={update} onOpen={onOpen} />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
