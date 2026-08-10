import { redirect } from 'next/navigation';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';
import ResolveButton from './ResolveButton';

export const dynamic = 'force-dynamic';

/**
 * Staff-facing home for pending_auth_deletions (0043) — the recovery
 * record for the one genuinely hard case in guardian account deletion:
 * DB cleanup (delete_own_guardian_account) succeeded, but the Supabase
 * Auth admin deleteUser() call then failed. The guardian's own session is
 * already revoked by the time a row lands here (see src/app/api/os/
 * account/delete/route.ts) — they cannot retry it themselves. This page
 * is the entire signal staff have that one Auth identity still needs
 * deleting by hand via the Supabase dashboard's Auth admin panel (or a
 * one-off script using the auth_user_id shown below).
 */
function formatAt(iso: string, withTime: boolean) {
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: 'UTC',
    day: 'numeric', month: 'short', year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

type Row = {
  id: string;
  auth_user_id: string;
  email: string | null;
  first_attempted_at: string;
  last_attempted_at: string;
  attempts: number;
  last_error: string | null;
  status: string;
  notes: string | null;
  resolved_at: string | null;
};

export default async function PendingAuthDeletionsPage() {
  const supabase = createClient();
  const staffCheck = await requireStaff(supabase);
  if (!staffCheck.ok) {
    redirect('/staff/login?next=/staff/pending-auth-deletions');
  }

  const serviceRole = createServiceRoleClient();
  const { data: pendingRows } = await serviceRole
    .from('pending_auth_deletions')
    .select('id, auth_user_id, email, first_attempted_at, last_attempted_at, attempts, last_error, status, notes, resolved_at')
    .eq('status', 'pending')
    .order('first_attempted_at', { ascending: true });
  const { data: resolvedRows } = await serviceRole
    .from('pending_auth_deletions')
    .select('id, auth_user_id, email, first_attempted_at, last_attempted_at, attempts, last_error, status, notes, resolved_at')
    .eq('status', 'resolved')
    .order('resolved_at', { ascending: false })
    .limit(20);

  const pending = (pendingRows ?? []) as Row[];
  const resolved = (resolvedRows ?? []) as Row[];

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-14">
      <span
        style={{
          fontFamily: 'var(--font-jbmono), monospace',
          fontSize: 12, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase',
          color: 'var(--accent)', background: 'var(--accent-tint)',
          padding: '6px 12px', borderRadius: 999, display: 'inline-block',
        }}
      >
        Internal · Staff only
      </span>

      <h1 style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 800, fontSize: 32, letterSpacing: '-0.02em', color: 'var(--ink)', margin: '20px 0 6px' }}>
        Stuck account deletions
      </h1>
      <p style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 15, color: 'var(--ink-soft)', margin: '0 0 8px' }}>
        A guardian&rsquo;s own data (profile, guardian links) was already removed, but Supabase Auth couldn&rsquo;t delete their sign-in
        credential automatically. Finish it via the Supabase dashboard&rsquo;s Auth admin panel using the user id below, then confirm here.
      </p>

      <h2 style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 18, color: 'var(--ink)', margin: '32px 0 12px' }}>
        Pending ({pending.length})
      </h2>
      {pending.length === 0 ? (
        <p style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 14, color: 'var(--ink-soft)' }}>Nothing pending.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {pending.map((r) => (
            <div key={r.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>
                  user {r.auth_user_id.slice(0, 8)}… {r.email ? `· ${r.email}` : ''}
                </div>
                <div style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 3 }}>
                  First attempt {formatAt(r.first_attempted_at, true)} UTC · last {formatAt(r.last_attempted_at, true)} UTC · {r.attempts} attempt{r.attempts === 1 ? '' : 's'}
                </div>
                {r.last_error && (
                  <div style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 12, color: '#b91c1c', marginTop: 3 }}>
                    Last error: {r.last_error}
                  </div>
                )}
              </div>
              <ResolveButton id={r.id} />
            </div>
          ))}
        </div>
      )}

      <h2 style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 18, color: 'var(--ink)', margin: '32px 0 12px' }}>
        Recently resolved
      </h2>
      {resolved.length === 0 ? (
        <p style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 14, color: 'var(--ink-soft)' }}>None yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {resolved.map((r) => (
            <div key={r.id} style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 13, color: 'var(--ink-soft)' }}>
              user {r.auth_user_id.slice(0, 8)}… — resolved {r.resolved_at ? formatAt(r.resolved_at, true) + ' UTC' : '—'}
              {r.notes ? ` — "${r.notes}"` : ''}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
