import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Who may redeem a guardian invite (player_invites). Runs with the service
 * role in POST /api/os/invites/redeem, before any write: no role, guardian
 * row, card lock, public id, invite consumption, audit event or
 * notification happens unless the result is 'eligible'.
 *
 * A guardian link grants full guardian control of a child and outlives any
 * coaching assignment, so an invite must not let a coach link themselves.
 * The redeemer is refused when they:
 *   1. created the invite;
 *   2. hold, or held, a coach assignment for the player's current team
 *      (active, ended or expired, or one the audit history records);
 *   3. are the player's direct coach;
 *   4. were the player's direct coach (the audit history records the link).
 * And when the invite carries no authority (5), or only coach authority and
 * the child already has a guardian (6), because only a guardian, or a
 * trusted order, may add another one.
 *
 * The invite's authority is derived from relationships and trusted columns,
 * never from its `origin` (a signed-in creator may set any allowed value)
 * and never from an email address merely matching an order's purchaser:
 *   - guardian: the creator is a current guardian of the child (a dual
 *     parent/coach therefore acts as the guardian they are);
 *   - order: `order_id` (written only by the trusted service-role order
 *     approval, resend and recovery-handoff paths; signed-in users cannot
 *     write it since 0090) names a fulfilled order whose single linked card
 *     is this child's, and the invite names its recipient, so redemption is
 *     bound to that recipient's verified email. A squad order (more than one
 *     linked card) never grants guardian authority: it covers every child on
 *     a team, and its purchaser is typically the team's coach;
 *   - coach: the creator holds an ACTIVE assignment for the child's current
 *     team at redemption, so an invite made through coach authority dies
 *     when that assignment ends or expires;
 *   - none: anything else (an unknown or deleted creator, an ex-guardian, an
 *     ended or expired coach, a direct coach): refused.
 *
 * Boundaries (see supabase/tests/authz/README.md):
 *   - the player's team history is not recorded, so a coach of a previous
 *     team is not detected; a genuine guardian may invite them;
 *   - an active coach can still create a first-guardian invite (child with
 *     no guardian) for an email or account they control; coaches cannot read
 *     other people's invite codes (0091), and an emailed invite is bound to
 *     its recipient (redeemerMatchesInvitedEmail), but a link-only invite
 *     can be used by anyone who holds the code. Whether a coach should ever
 *     originate the first guardian is a safeguarding-owner decision;
 *   - these reads and the redemption writes are separate PostgREST calls,
 *     not one transaction: a relationship created between this check and
 *     the guardian insert is not seen.
 *
 * Any failed read fails closed. Nothing here logs, and no database text or
 * relationship detail leaves this function: the caller gets only the
 * outcome, and on failure the raw error for code-only logging.
 */
export type GuardianInviteForRedemption = {
  player_id: string;
  created_by: string | null;
  order_id: string | null;
  invited_email: string | null;
};

export type GuardianInviteAuthority = 'guardian' | 'order' | 'coach';

export type GuardianInviteEligibility =
  | { outcome: 'eligible'; authority: GuardianInviteAuthority }
  | { outcome: 'refused' }
  | { outcome: 'failed'; error: unknown };

/** The one response for every refusal, so none reveals which rule applied. */
export const GUARDIAN_INVITE_REDEEM_REFUSED_MESSAGE = "This invite can't be accepted with this account.";

const normalisedEmail = (value: unknown) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

/**
 * An invite that names a recipient (invited_email) may be redeemed only by
 * an account whose verified email is that address, compared without case
 * or surrounding whitespace. Holding the code is not enough: a code can be
 * passed on. An invite with no recipient email keeps its link-only
 * behaviour (anyone holding the code, subject to the other rules).
 */
export function redeemerMatchesInvitedEmail(
  invitedEmail: string | null | undefined,
  redeemer: { email?: string | null; email_confirmed_at?: string | null }
): boolean {
  const invited = normalisedEmail(invitedEmail);
  if (!invited) return true;
  const own = normalisedEmail(redeemer.email);
  return own !== '' && !!redeemer.email_confirmed_at && own === invited;
}

type Row = Record<string, unknown>;
type Read = { data: unknown; error: unknown };

class ReadFailed {
  error: unknown;
  constructor(error: unknown) {
    this.error = error;
  }
}

function rowsOf(result: Read): Row[] {
  if (result.error) throw new ReadFailed(result.error);
  const data = result.data;
  if (!data) return [];
  return (Array.isArray(data) ? data : [data]) as Row[];
}

/** Rows whose given columns equal the given values (re-checked here, not only in the query). */
function matching(rows: Row[], expected: Row): Row[] {
  return rows.filter((r) => Object.entries(expected).every(([k, v]) => r[k] === v));
}

async function isCurrentGuardian(service: SupabaseClient, playerId: string, profileId: string) {
  const rows = rowsOf(
    await service.from('guardians').select('player_id, profile_id').eq('player_id', playerId).eq('profile_id', profileId).limit(1)
  );
  return matching(rows, { player_id: playerId, profile_id: profileId }).length > 0;
}

/**
 * A trusted order: fulfilled, with exactly one linked card, and that card is
 * this child's (the same single-card rule order approval and resend use
 * before they create a guardian invite).
 */
async function isQualifyingOrder(service: SupabaseClient, orderId: string, playerId: string) {
  const orders = matching(rowsOf(await service.from('orders').select('id, payment_status').eq('id', orderId).limit(1)), { id: orderId });
  if (orders[0]?.payment_status !== 'fulfilled') return false;
  const linked = matching(rowsOf(await service.from('cards').select('player_id, order_id').eq('order_id', orderId)), { order_id: orderId }).filter(
    (c) => typeof c.player_id === 'string'
  );
  return linked.length === 1 && linked[0].player_id === playerId;
}

/** Mirrors isActiveCoachAssignment (src/lib/coach-assignment.ts) and the database's coach_assignment_is_active. */
function isActiveAssignment(row: Row, now = Date.now()) {
  if (row.ended_at) return false;
  if (row.expires_at != null && new Date(row.expires_at as string | Date).getTime() <= now) return false;
  return true;
}

async function playerTeamId(service: SupabaseClient, playerId: string) {
  const teamId = rowsOf(await service.from('players').select('team_id').eq('id', playerId).maybeSingle())[0]?.team_id;
  return typeof teamId === 'string' ? teamId : null;
}

/** The creator holds an active assignment for the child's current team now (not a direct link, not an ended or expired one). */
async function isActiveTeamCoach(service: SupabaseClient, playerId: string, profileId: string) {
  const teamId = await playerTeamId(service, playerId);
  if (!teamId) return false;
  const rows = matching(
    rowsOf(await service.from('coach_team').select('team_id, profile_id, ended_at, expires_at').eq('team_id', teamId).eq('profile_id', profileId)),
    { team_id: teamId, profile_id: profileId }
  );
  return rows.some((r) => isActiveAssignment(r));
}

/** The authority the invite carries, derived from current relationships and trusted columns only (null: none). */
export async function classifyGuardianInviteAuthority(
  service: SupabaseClient,
  invite: GuardianInviteForRedemption
): Promise<GuardianInviteAuthority | null> {
  if (invite.created_by && (await isCurrentGuardian(service, invite.player_id, invite.created_by))) return 'guardian';
  if (invite.order_id && normalisedEmail(invite.invited_email) && (await isQualifyingOrder(service, invite.order_id, invite.player_id))) return 'order';
  if (invite.created_by && (await isActiveTeamCoach(service, invite.player_id, invite.created_by))) return 'coach';
  return null;
}

async function isOrWasCoach(service: SupabaseClient, playerId: string, redeemerId: string) {
  const teamId = await playerTeamId(service, playerId);

  if (teamId) {
    // Any assignment row for this team, whatever its state: active, ended or expired.
    const assignments = rowsOf(
      await service.from('coach_team').select('team_id, profile_id').eq('team_id', teamId).eq('profile_id', redeemerId)
    );
    if (matching(assignments, { team_id: teamId, profile_id: redeemerId }).length) return true;
    // An assignment the audit history records, even if its row is gone.
    const assignmentHistory = rowsOf(
      await service
        .from('relationship_audit_events')
        .select('table_name, team_id, profile_id')
        .eq('table_name', 'coach_team')
        .eq('team_id', teamId)
        .eq('profile_id', redeemerId)
        .limit(1)
    );
    if (matching(assignmentHistory, { table_name: 'coach_team', team_id: teamId, profile_id: redeemerId }).length) return true;
  }

  const directLink = rowsOf(
    await service.from('coach_players').select('player_id, profile_id').eq('player_id', playerId).eq('profile_id', redeemerId).limit(1)
  );
  if (matching(directLink, { player_id: playerId, profile_id: redeemerId }).length) return true;

  // A direct link the audit history records (created or removed since 0088).
  const directHistory = rowsOf(
    await service
      .from('relationship_audit_events')
      .select('table_name, player_id, profile_id')
      .eq('table_name', 'coach_players')
      .eq('player_id', playerId)
      .eq('profile_id', redeemerId)
      .limit(1)
  );
  return matching(directHistory, { table_name: 'coach_players', player_id: playerId, profile_id: redeemerId }).length > 0;
}

async function childHasGuardian(service: SupabaseClient, playerId: string) {
  const rows = rowsOf(await service.from('guardians').select('player_id, profile_id').eq('player_id', playerId).limit(1));
  return matching(rows, { player_id: playerId }).length > 0;
}

export type FirstGuardianClaimEligibility = { outcome: 'eligible' } | { outcome: 'refused' } | { outcome: 'failed'; error: unknown };

/**
 * Whether `claimantId` may become `playerId`'s guardian by holding the
 * child's card (a claim code, or purchaser recovery). Call before any write.
 *
 * The coach who adds a roster player receives that player's claim code, so a
 * current or former coach of the player's current team (active, ended or
 * expired, or in the audit history) and a current or former direct coach are
 * refused: they must not link their own coach account as the child's
 * guardian. Someone who is already this child's guardian is not affected
 * (the existing claim path answers them). This cannot tell whether a separate,
 * otherwise unrelated account belongs to the coach, and a coach of the
 * player's previous team is not detected (team history is not recorded).
 */
export async function checkFirstGuardianClaim(
  service: SupabaseClient,
  playerId: string,
  claimantId: string
): Promise<FirstGuardianClaimEligibility> {
  try {
    if (await isCurrentGuardian(service, playerId, claimantId)) return { outcome: 'eligible' };
    if (await isOrWasCoach(service, playerId, claimantId)) return { outcome: 'refused' };
    return { outcome: 'eligible' };
  } catch (e) {
    if (e instanceof ReadFailed) return { outcome: 'failed', error: e.error };
    throw e;
  }
}

/** Whether `redeemerId` may redeem `invite`. Call immediately before the first redemption write. */
export async function checkGuardianInviteRedemption(
  service: SupabaseClient,
  invite: GuardianInviteForRedemption,
  redeemerId: string
): Promise<GuardianInviteEligibility> {
  try {
    if (invite.created_by === redeemerId) return { outcome: 'refused' };
    if (await isOrWasCoach(service, invite.player_id, redeemerId)) return { outcome: 'refused' };
    const authority = await classifyGuardianInviteAuthority(service, invite);
    if (!authority) return { outcome: 'refused' };
    if (authority === 'coach' && (await childHasGuardian(service, invite.player_id))) return { outcome: 'refused' };
    return { outcome: 'eligible', authority };
  } catch (e) {
    if (e instanceof ReadFailed) return { outcome: 'failed', error: e.error };
    throw e;
  }
}
