import { describe, expect, it } from 'vitest';
import { selectNewestUnreadForPlayer } from './story-update-selection';
import type { StoryUpdate } from '@/app/os/osData';

function update(overrides: Partial<StoryUpdate>): StoryUpdate {
  return {
    id: overrides.id ?? 'update-id',
    eventType: 'assessment_shared',
    category: 'coach',
    title: 'Coach Assessment',
    body: 'placeholder',
    playerId: 'player-id',
    relatedMomentId: null,
    readAt: null,
    createdAt: '2026-08-06T08:57:00.226171+00:00',
    ...overrides,
  };
}

// Mirrors the real fixture this bug was found with: Guardian A guards both
// Casey and Jenny. Jenny has an unread Coach Assessment; Casey has none.
const JENNY_ID = 'jenny-player-id';
const CASEY_ID = 'casey-player-id';
const jennyAssessment = update({
  id: 'jenny-assessment',
  playerId: JENNY_ID,
  title: 'Coach Assessment',
  body: 'Blake shared new feedback on Jenny: "Jenny is growing as a player, mum should be very proud"',
  createdAt: '2026-08-06T08:57:00.226171+00:00',
});

describe('selectNewestUnreadForPlayer — Coach Assessment / "What\'s New" player scoping', () => {
  it('Casey selected: Jenny\'s assessment does not appear (Casey has none)', () => {
    const storyUpdates = [jennyAssessment];
    expect(selectNewestUnreadForPlayer(storyUpdates, CASEY_ID)).toBeNull();
  });

  it('Jenny selected: Jenny\'s assessment appears', () => {
    const storyUpdates = [jennyAssessment];
    expect(selectNewestUnreadForPlayer(storyUpdates, JENNY_ID)).toEqual(jennyAssessment);
  });

  it('never falls back to another player\'s update when the selected player has none', () => {
    const caseyOnlyIrrelevantUpdate = update({ id: 'other', playerId: 'some-other-player-id' });
    const storyUpdates = [jennyAssessment, caseyOnlyIrrelevantUpdate];
    expect(selectNewestUnreadForPlayer(storyUpdates, CASEY_ID)).toBeNull();
  });

  it('read updates are excluded even for the correct player', () => {
    const readAssessment = update({ playerId: CASEY_ID, readAt: '2026-08-07T00:00:00Z' });
    expect(selectNewestUnreadForPlayer([readAssessment], CASEY_ID)).toBeNull();
  });

  it('picks the newest matching update for the selected player when several are unread (input is already newest-first, matching the real fetch order)', () => {
    const older = update({ id: 'older', playerId: JENNY_ID, createdAt: '2026-08-01T00:00:00Z' });
    const newer = update({ id: 'newer', playerId: JENNY_ID, createdAt: '2026-08-06T00:00:00Z' });
    // Real fetch orders newest-first (see os-data.ts .order('created_at', {ascending:false})).
    expect(selectNewestUnreadForPlayer([newer, older], JENNY_ID)?.id).toBe('newer');
  });

  it('matches by player ID only, not by name — duplicate player names do not affect filtering', () => {
    const idA = 'duplicate-name-player-a';
    const idB = 'duplicate-name-player-b';
    const forA = update({ id: 'for-a', playerId: idA, title: 'Coach Assessment', body: 'About player A' });
    const forB = update({ id: 'for-b', playerId: idB, title: 'Coach Assessment', body: 'About player B (same display name as A)' });
    expect(selectNewestUnreadForPlayer([forA, forB], idA)?.id).toBe('for-a');
    expect(selectNewestUnreadForPlayer([forA, forB], idB)?.id).toBe('for-b');
  });

  it('returns null with no player selected (never guesses a fallback player)', () => {
    expect(selectNewestUnreadForPlayer([jennyAssessment], null)).toBeNull();
  });

  it('returns null when storyUpdates is empty', () => {
    expect(selectNewestUnreadForPlayer([], JENNY_ID)).toBeNull();
  });
});
