'use client';

import { useRouter } from 'next/navigation';
import type { QueueSort } from '@/lib/staff-queue-search';

/** Shown in place of a subsection's normal "nothing here" message when a
 * player-name search is active and matches nothing in that subsection —
 * clears only `q`, leaving the current sort selection untouched. */
export default function QueueSearchEmptyState({ currentSort }: { currentSort: QueueSort }) {
  const router = useRouter();

  const clear = () => {
    const params = new URLSearchParams();
    if (currentSort !== 'newest') params.set('sort', currentSort);
    const qs = params.toString();
    router.replace(qs ? `/staff/queue?${qs}` : '/staff/queue', { scroll: false });
  };

  return (
    <div
      style={{
        padding: '20px 18px', borderRadius: 16, background: '#fff',
        boxShadow: 'inset 0 0 0 1px var(--line)', textAlign: 'center',
      }}
    >
      <div style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>
        No players found
      </div>
      <p style={{ margin: '4px 0 14px', fontFamily: 'var(--font-manrope), system-ui', fontSize: 13.5, color: 'var(--ink-soft)' }}>
        Try another name or clear your search.
      </p>
      <button
        type="button"
        onClick={clear}
        style={{
          fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 12.5,
          color: 'var(--accent)', background: 'var(--accent-tint)',
          padding: '9px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
        }}
      >
        Clear search
      </button>
    </div>
  );
}
