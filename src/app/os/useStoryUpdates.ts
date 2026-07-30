'use client';

import { useState } from 'react';
import { useLiveContent } from './useLiveContent';
import type { StoryUpdate } from './osData';

type StoryUpdateRow = {
  id: string;
  event_type: StoryUpdate['eventType'];
  category: StoryUpdate['category'];
  title: string;
  body: string;
  player_id: string;
  related_moment_id: string | null;
  read_at: string | null;
  created_at: string;
};

function fromRow(row: StoryUpdateRow): StoryUpdate {
  return {
    id: row.id,
    eventType: row.event_type,
    category: row.category,
    title: row.title,
    body: row.body,
    playerId: row.player_id,
    relatedMomentId: row.related_moment_id,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

/**
 * Seeded from the SSR snapshot (src/lib/os-data.ts's getOsData), then kept
 * live via a single per-session subscription to story_updates inserts for
 * this viewer — this is the bell badge / Story Updates list's only source
 * of truth once mounted. Never polls, never needs router.refresh().
 */
export function useStoryUpdates(initial: StoryUpdate[], initialUnreadCount: number, viewerId: string | null) {
  const [storyUpdates, setStoryUpdates] = useState<StoryUpdate[]>(initial);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);

  useLiveContent<StoryUpdateRow>(
    'story_updates',
    viewerId ? `recipient_profile_id=eq.${viewerId}` : null,
    (change) => {
      if (change.eventType !== 'INSERT') return;
      const update = fromRow(change.new);
      setStoryUpdates((prev) => [update, ...prev]);
      if (!update.readAt) setUnreadCount((c) => c + 1);
    }
  );

  const markRead = (id: string) => {
    const target = storyUpdates.find((u) => u.id === id);
    if (!target || target.readAt) return;
    setStoryUpdates((prev) => prev.map((u) => (u.id === id ? { ...u, readAt: new Date().toISOString() } : u)));
    setUnreadCount((c) => Math.max(0, c - 1));
    fetch(`/api/os/story-updates/${id}/read`, { method: 'PATCH' }).catch(() => {});
  };

  return { storyUpdates, unreadCount, markRead };
}
