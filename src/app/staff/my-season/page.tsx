import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';
import StaffMySeasonPanel from './StaffMySeasonPanel';

export const dynamic = 'force-dynamic';

/**
 * Find a coach's My Season note by player ID and remove it permanently, with
 * a required reason. Everything is loaded in the panel through the staff API,
 * so no note text is in this page's server render.
 */
export default async function StaffMySeasonPage() {
  const staffCheck = await requireStaff(createClient());
  if (!staffCheck.ok) {
    redirect('/staff/login?next=/staff/my-season');
  }

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-14">
      <Link href="/staff/queue" style={{ color: 'var(--ink-soft)', fontSize: 13 }}>&larr; Staff queue</Link>
      <div style={{ marginTop: 14 }}>
        <span
          style={{
            fontFamily: 'var(--font-jbmono), monospace', fontSize: 12, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase',
            color: 'var(--accent)', background: 'var(--accent-tint)', padding: '6px 12px', borderRadius: 999, display: 'inline-block',
          }}
        >
          Internal · Staff only
        </span>
      </div>
      <h1 style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 800, fontSize: 32, letterSpacing: '-0.02em', color: 'var(--ink)', margin: '20px 0 6px' }}>
        My Season notes
      </h1>
      <p style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 15, color: 'var(--ink-soft)', margin: '0 0 24px' }}>
        Find a coach&rsquo;s note on a child&rsquo;s My Season and remove it permanently. Every lookup and every removal is recorded against your account.
      </p>
      <StaffMySeasonPanel />
    </div>
  );
}
