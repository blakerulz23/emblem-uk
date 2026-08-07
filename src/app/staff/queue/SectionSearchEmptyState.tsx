'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { buildStaffQueueUrl } from '@/lib/staff-queue-search';

/** Shown in place of a section's normal "nothing here" message when its
 * search is active and matches nothing — clears only that section's `Q`
 * param (leaving its sort, and every other section's state, untouched). */
export default function SectionSearchEmptyState({
  paramPrefix,
  heading,
}: {
  paramPrefix: string;
  heading: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const clear = () => {
    router.replace(buildStaffQueueUrl(searchParams, { [`${paramPrefix}Q`]: null, [`${paramPrefix}Page`]: null }), { scroll: false });
  };

  return (
    <div
      style={{
        padding: '20px 18px', borderRadius: 16, background: '#fff',
        boxShadow: 'inset 0 0 0 1px var(--line)', textAlign: 'center',
      }}
    >
      <div style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>
        {heading}
      </div>
      <p style={{ margin: '4px 0 14px', fontFamily: 'var(--font-manrope), system-ui', fontSize: 13.5, color: 'var(--ink-soft)' }}>
        Try another name, email or order reference.
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
