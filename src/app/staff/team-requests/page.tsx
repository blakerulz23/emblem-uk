import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';
import { currentUkFootballSeason } from '@/lib/season';
import TeamRequestActions from './TeamRequestActions';
import type { TeamOption } from './TeamRequestActions';

export const dynamic = 'force-dynamic';

/**
 * Coaches ask for a team here instead of creating one themselves (migration
 * 0088). Approving creates (or picks) the team and makes the requester its
 * coach; rejecting tells them why. Nothing on this page shows child data.
 */
// Fixed UTC, for the same hydration reason as /staff/deletion-requests.
function formatAt(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

type RequestRow = {
  id: string;
  requester_profile_id: string;
  club_name: string;
  team_name: string;
  age_group: string | null;
  note: string | null;
  status: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
};

const text = { fontFamily: 'var(--font-manrope), system-ui', fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 3 } as const;
const h2 = { fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 18, color: 'var(--ink)', margin: '32px 0 12px' } as const;

export default async function StaffTeamRequestsPage() {
  const supabase = createClient();
  const staffCheck = await requireStaff(supabase);
  if (!staffCheck.ok) {
    redirect('/staff/login?next=/staff/team-requests');
  }

  const serviceRole = createServiceRoleClient();
  const columns = 'id, requester_profile_id, club_name, team_name, age_group, note, status, decided_by, decided_at, decision_note, created_at';
  const [{ data: pendingRows }, { data: decidedRows }, { data: teamRows }] = await Promise.all([
    serviceRole.from('coach_team_requests').select(columns).eq('status', 'pending').order('created_at', { ascending: true }),
    serviceRole.from('coach_team_requests').select(columns).neq('status', 'pending').order('decided_at', { ascending: false }).limit(20),
    serviceRole.from('teams').select('id, name, clubs ( name ), seasons ( label )').order('name', { ascending: true }),
  ]);
  const pending = (pendingRows ?? []) as RequestRow[];
  const decided = (decidedRows ?? []) as RequestRow[];

  const profileIds = Array.from(new Set([...pending, ...decided].flatMap((r) => [r.requester_profile_id, r.decided_by]).filter((v): v is string => !!v)));
  const { data: profiles } = profileIds.length
    ? await serviceRole.from('profiles').select('id, display_name').in('id', profileIds)
    : { data: [] as { id: string; display_name: string | null }[] };
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));

  type TeamRow = { id: string; name: string; clubs: { name: string } | null; seasons: { label: string } | null };
  const teams: TeamOption[] = ((teamRows ?? []) as unknown as TeamRow[])
    .map((t) => ({ id: t.id, label: [t.clubs?.name, t.name, t.seasons?.label ? `(${t.seasons.label})` : null].filter(Boolean).join(' ') }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-14">
      <span
        style={{
          fontFamily: 'var(--font-jbmono), monospace', fontSize: 12, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase',
          color: 'var(--accent)', background: 'var(--accent-tint)', padding: '6px 12px', borderRadius: 999, display: 'inline-block',
        }}
      >
        Internal · Staff only
      </span>
      <h1 style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 800, fontSize: 32, letterSpacing: '-0.02em', color: 'var(--ink)', margin: '20px 0 6px' }}>
        Coach team requests
      </h1>
      <p style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 15, color: 'var(--ink-soft)', margin: '0 0 8px' }}>
        A coach can&rsquo;t see any players until a request is approved here, or until they join through a team invite. Check the
        club and team are real and that this person coaches it before approving. To end someone&rsquo;s access later, use{' '}
        <Link href="/staff/coach-assignments" style={{ color: 'var(--accent)', fontWeight: 700 }}>
          coach assignments
        </Link>
        .
      </p>

      <h2 style={h2}>Pending ({pending.length})</h2>
      {pending.length === 0 ? (
        <p style={{ ...text, fontSize: 14 }}>Nothing pending.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {pending.map((r) => (
            <div key={r.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 14.5, color: 'var(--ink)' }}>
                  {r.club_name} · {r.team_name}
                  {r.age_group ? ` · ${r.age_group}` : ''}
                </div>
                <div style={text}>
                  From {nameById.get(r.requester_profile_id) ?? 'an unnamed account'} · {formatAt(r.created_at)} UTC
                </div>
                {r.note && <div style={{ ...text, fontStyle: 'italic' }}>&ldquo;{r.note}&rdquo;</div>}
              </div>
              <TeamRequestActions requestId={r.id} teams={teams} defaultSeason={currentUkFootballSeason()} />
            </div>
          ))}
        </div>
      )}

      <h2 style={h2}>Recently decided</h2>
      {decided.length === 0 ? (
        <p style={{ ...text, fontSize: 14 }}>None yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {decided.map((r) => (
            <div key={r.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
              <div style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 13, color: 'var(--ink)', fontWeight: 600 }}>
                {r.club_name} · {r.team_name} — {r.status}
              </div>
              <div style={{ ...text, fontSize: 12 }}>
                {nameById.get(r.requester_profile_id) ?? 'An unnamed account'} · {r.decided_at ? `${formatAt(r.decided_at)} UTC` : ''}
                {r.status !== 'cancelled' && r.decided_by ? ` by ${nameById.get(r.decided_by) ?? 'staff'}` : ''}
              </div>
              {r.decision_note && <div style={{ ...text, fontSize: 12, fontStyle: 'italic' }}>&ldquo;{r.decision_note}&rdquo;</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
