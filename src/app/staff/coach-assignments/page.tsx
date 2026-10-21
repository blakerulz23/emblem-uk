import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';
import { activeCoachAssignments, COACH_ASSIGNMENT_STATE_COLUMNS } from '@/lib/coach-assignment';
import EndAssignmentButton from './EndAssignmentButton';

export const dynamic = 'force-dynamic';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
}

const CREATED_VIA_LABEL: Record<string, string> = {
  team_invite: 'team invite',
  staff_team_request: 'approved request',
  staff: 'staff',
  legacy: 'before records',
};

type AssignmentRow = {
  team_id: string;
  profile_id: string;
  created_at: string | null;
  created_via: string | null;
  expires_at: string | null;
  ended_at: string | null;
  teams: { name: string; clubs: { name: string } | null; seasons: { label: string } | null } | null;
};

/**
 * Every active coach assignment, by team, with an End action. Assignments
 * made before 0088 show "before records": their creation details were never
 * stored, and none are invented. Nothing on this page shows child data.
 */
export default async function StaffCoachAssignmentsPage() {
  const supabase = createClient();
  const staffCheck = await requireStaff(supabase);
  if (!staffCheck.ok) {
    redirect('/staff/login?next=/staff/coach-assignments');
  }

  const serviceRole = createServiceRoleClient();
  const { data: rows } = await serviceRole
    .from('coach_team')
    .select(`team_id, profile_id, created_at, created_via, ${COACH_ASSIGNMENT_STATE_COLUMNS}, teams ( name, clubs ( name ), seasons ( label ) )`);
  const active = activeCoachAssignments((rows ?? []) as unknown as AssignmentRow[]);

  const profileIds = Array.from(new Set(active.map((r) => r.profile_id)));
  const { data: profiles } = profileIds.length
    ? await serviceRole.from('profiles').select('id, display_name').in('id', profileIds)
    : { data: [] as { id: string; display_name: string | null }[] };
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));

  const byTeam = new Map<string, { label: string; rows: AssignmentRow[] }>();
  for (const r of active) {
    const label = [r.teams?.clubs?.name, r.teams?.name, r.teams?.seasons?.label ? `(${r.teams.seasons.label})` : null].filter(Boolean).join(' ') || 'Unnamed team';
    const group = byTeam.get(r.team_id) ?? { label, rows: [] };
    group.rows.push(r);
    byTeam.set(r.team_id, group);
  }
  const groups = Array.from(byTeam.entries()).sort((a, b) => a[1].label.localeCompare(b[1].label));

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
        Coach assignments
      </h1>
      <p style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 15, color: 'var(--ink-soft)', margin: '0 0 8px' }}>
        Everyone who currently coaches a team. Ending an assignment keeps the record and removes the coach&rsquo;s access to that
        team. New coaches come from{' '}
        <Link href="/staff/team-requests" style={{ color: 'var(--accent)', fontWeight: 700 }}>
          team requests
        </Link>{' '}
        or team invites.
      </p>

      <h2 style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 18, color: 'var(--ink)', margin: '32px 0 12px' }}>
        Active ({active.length})
      </h2>
      {groups.length === 0 ? (
        <p style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 14, color: 'var(--ink-soft)' }}>No active assignments.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {groups.map(([teamId, group]) => (
            <div key={teamId} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px' }}>
              <div style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 14.5, color: 'var(--ink)', marginBottom: 6 }}>{group.label}</div>
              {group.rows.map((r) => {
                const name = nameById.get(r.profile_id) ?? 'Unnamed coach';
                return (
                  <div key={r.profile_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', padding: '8px 0', borderTop: '1px solid var(--border)' }}>
                    <div>
                      <div style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{name}</div>
                      <div style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>
                        {r.created_at ? `Since ${formatDate(r.created_at)}` : 'Since before records'}
                        {r.created_via ? ` · via ${CREATED_VIA_LABEL[r.created_via] ?? r.created_via}` : ''}
                        {r.expires_at ? ` · access ends ${formatDate(r.expires_at)}` : ''}
                      </div>
                    </div>
                    <EndAssignmentButton teamId={r.team_id} profileId={r.profile_id} coachName={name} />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
