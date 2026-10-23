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
 * And when the invite was made through coach authority and the child
 * already has a guardian (5), because only a guardian may add another one.
 *
 * The creator's authority is derived from relationships, never from the
 * invite's `origin`, which a signed-in creator may set to any allowed value:
 *   - guardian: the creator is a current guardian of the child (a dual
 *     parent/coach therefore acts as the guardian they are);
 *   - order: `order_id` names an order whose card is this child's (signed-in
 *     users cannot write `order_id` since 0090);
 *   - recovery_handoff: the creator's verified email is the purchaser of a
 *     fulfilled order for this child's card (POST /api/os/recover);
 *   - coach: everything else, including a creator who is unknown, deleted
 *     or no longer a guardian.
 *
 * Boundaries (see supabase/tests/authz/README.md):
 *   - the player's team history is not recorded, so a coach of a previous
 *     team is not detected; a genuine guardian may invite them;
 *   - an invite code does not prove who holds it, so a coach can still pass
 *     a first-guardian invite (child with no guardian) to another account;
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
};

export type GuardianInviteAuthority = 'guardian' | 'order' | 'recovery_handoff' | 'coach';

export type GuardianInviteEligibility =
  | { outcome: 'eligible'; authority: GuardianInviteAuthority }
  | { outcome: 'refused' }
  | { outcome: 'failed'; error: unknown };

/** The one response for every refusal, so none reveals which rule applied. */
export const GUARDIAN_INVITE_REDEEM_REFUSED_MESSAGE = "This invite can't be accepted with this account.";

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

async function orderMatchesChild(service: SupabaseClient, orderId: string, playerId: string) {
  const rows = rowsOf(await service.from('cards').select('player_id, order_id').eq('order_id', orderId).eq('player_id', playerId).limit(1));
  return matching(rows, { player_id: playerId, order_id: orderId }).length > 0;
}

async function isFulfilledPurchaser(service: SupabaseClient, creatorId: string, playerId: string) {
  const { data, error } = await service.auth.admin.getUserById(creatorId);
  if (error) throw new ReadFailed(error);
  const email = data?.user?.email;
  if (!email || !data.user.email_confirmed_at) return false;

  const cards = matching(rowsOf(await service.from('cards').select('player_id, order_id').eq('player_id', playerId)), { player_id: playerId });
  const orderIds = Array.from(new Set(cards.map((c) => c.order_id).filter((id): id is string => typeof id === 'string')));
  if (!orderIds.length) return false;

  const orders = rowsOf(await service.from('orders').select('id, purchaser_email, payment_status').in('id', orderIds));
  return orders.some(
    (o) =>
      typeof o.id === 'string' &&
      orderIds.includes(o.id) &&
      o.payment_status === 'fulfilled' &&
      typeof o.purchaser_email === 'string' &&
      o.purchaser_email.toLowerCase() === email.toLowerCase()
  );
}

/** The authority the invite was created under, derived from current relationships and trusted columns only. */
export async function classifyGuardianInviteAuthority(
  service: SupabaseClient,
  invite: GuardianInviteForRedemption
): Promise<GuardianInviteAuthority> {
  if (invite.created_by && (await isCurrentGuardian(service, invite.player_id, invite.created_by))) return 'guardian';
  if (invite.order_id && (await orderMatchesChild(service, invite.order_id, invite.player_id))) return 'order';
  if (invite.created_by && (await isFulfilledPurchaser(service, invite.created_by, invite.player_id))) return 'recovery_handoff';
  return 'coach';
}

async function isOrWasCoach(service: SupabaseClient, playerId: string, redeemerId: string) {
  const teamId = rowsOf(await service.from('players').select('team_id').eq('id', playerId).maybeSingle())[0]?.team_id;

  if (typeof teamId === 'string') {
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
    if (authority === 'coach' && (await childHasGuardian(service, invite.player_id))) return { outcome: 'refused' };
    return { outcome: 'eligible', authority };
  } catch (e) {
    if (e instanceof ReadFailed) return { outcome: 'failed', error: e.error };
    throw e;
  }
}
