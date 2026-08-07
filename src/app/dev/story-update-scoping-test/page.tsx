'use client';

/**
 * DEV-ONLY diagnostic page — not linked from anywhere in the product.
 * Exists to answer one question with evidence instead of assumption: does
 * the Home "What's New" card correctly scope a Coach Assessment (or any
 * other story update) to the currently selected player, using the same
 * selectNewestUnreadForPlayer() function PlayerHome.tsx renders through —
 * never a reimplementation of it.
 *
 * Fixture mirrors the real bug reproduction (Guardian A guards both Casey
 * and Jenny; Jenny has an unread Coach Assessment, Casey has none) using
 * the same wording confirmed against the real player_assessments/
 * story_updates rows during this fix's read-only data check — no real
 * player IDs, tokens, or guardian identity involved.
 */

import { useState } from 'react';
import { selectNewestUnreadForPlayer } from '@/lib/story-update-selection';
import type { StoryUpdate } from '@/app/os/osData';

const JENNY_ID = 'dev-fixture-jenny';
const CASEY_ID = 'dev-fixture-casey';

const FIXTURE_STORY_UPDATES: StoryUpdate[] = [
  {
    id: 'dev-fixture-assessment',
    eventType: 'assessment_shared',
    category: 'coach',
    title: 'Coach Assessment',
    body: 'Blake shared new feedback on Jenny: "Jenny is growing as a player, mum should be very proud"',
    playerId: JENNY_ID,
    relatedMomentId: null,
    readAt: null,
    createdAt: '2026-08-06T08:57:00.226171+00:00',
  },
];

function WhatsNewCard({ playerName, playerId }: { playerName: string; playerId: string }) {
  const newestUnread = selectNewestUnreadForPlayer(FIXTURE_STORY_UPDATES, playerId);
  return (
    <div style={{ margin: '18px 2px 0' }} data-testid="whats-new-section">
      <div style={{ fontFamily: 'sans-serif', fontWeight: 700, letterSpacing: '.1em', fontSize: 11, color: '#E97435', marginBottom: 8, textTransform: 'uppercase' }}>
        What&apos;s New — {playerName}
      </div>
      {newestUnread ? (
        <div data-testid="whats-new-card" style={{ background: '#1a1a1a', color: '#fff', borderRadius: 16, padding: 14, borderLeft: '3px solid #E97435' }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 3 }}>{newestUnread.title}</div>
          <div style={{ fontSize: 13, opacity: 0.8, lineHeight: 1.4 }}>{newestUnread.body}</div>
        </div>
      ) : (
        <div data-testid="whats-new-empty" style={{ color: '#888', fontSize: 13, fontFamily: 'sans-serif' }}>
          (no card rendered — matches PlayerHome.tsx&apos;s existing empty-state pattern for this section)
        </div>
      )}
    </div>
  );
}

export default function StoryUpdateScopingTestPage() {
  const [selected, setSelected] = useState<'casey' | 'jenny'>('casey');
  const playerId = selected === 'casey' ? CASEY_ID : JENNY_ID;
  const playerName = selected === 'casey' ? 'Casey' : 'Jenny';

  return (
    <main style={{ padding: 40, fontFamily: 'system-ui, sans-serif', background: '#111', color: '#fff', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 20 }}>Coach Assessment player-scoping — dev diagnostic</h1>
      <p style={{ opacity: 0.7, maxWidth: 640 }}>
        Fixture: Jenny has one unread Coach Assessment story update; Casey has none. Not linked from the product — for automated/manual comparison only.
      </p>

      <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
        <button
          type="button"
          data-testid="select-casey"
          onClick={() => setSelected('casey')}
          style={{ padding: '10px 16px', background: selected === 'casey' ? '#E97435' : '#333', border: 'none', borderRadius: 6, color: '#fff', fontWeight: 700, cursor: 'pointer' }}
        >
          Select Casey
        </button>
        <button
          type="button"
          data-testid="select-jenny"
          onClick={() => setSelected('jenny')}
          style={{ padding: '10px 16px', background: selected === 'jenny' ? '#E97435' : '#333', border: 'none', borderRadius: 6, color: '#fff', fontWeight: 700, cursor: 'pointer' }}
        >
          Select Jenny
        </button>
      </div>

      <div style={{ marginTop: 24, width: 340 }}>
        <WhatsNewCard playerName={playerName} playerId={playerId} />
      </div>

      {/* Selected player identity, so a visual/automated check can confirm the card matches whichever name is shown here. */}
      <div data-testid="selected-player-name" style={{ marginTop: 16, fontSize: 12, opacity: 0.6 }}>
        Currently selected player: {playerName}
      </div>
    </main>
  );
}
