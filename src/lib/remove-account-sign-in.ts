import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Removes the Supabase Auth user of an account whose data has already been
 * erased (complete_pending_profile_deletion, migration 0097), through the
 * existing pending_auth_deletions (0043) workflow. Server-only: needs the
 * service-role client.
 *
 * Supabase: deleting the Auth user deletes its sessions and refresh tokens,
 * but an access token already issued stays valid until it expires. So:
 *   1. the database has already recorded the account in erased_accounts in
 *      the same transaction as the erasure; the middleware refuses its
 *      sessions on every request and no profile can be recreated for it;
 *   2. the user is banned first, so it can neither sign in nor refresh even
 *      if the delete below fails;
 *   3. then deleted. Success, or "already gone", resolves the queue row;
 *      a failure is recorded on it (attempts, last error) for a retry.
 * Idempotent: calling it again for a removed user just resolves the row.
 */
export type SignInRemoval = { state: 'removed' | 'removal_pending'; banned: boolean };

// Supabase's maximum-style ban: about a hundred years.
export const PERMANENT_BAN_DURATION = '876000h';

type AdminError = { status?: number; code?: string; message?: string } | null | undefined;
const isNotFound = (e: AdminError) => !!e && (e.status === 404 || e.code === 'user_not_found');

export async function removeAccountSignIn(service: SupabaseClient, profileId: string, staffProfileId: string): Promise<SignInRemoval> {
  const admin = service.auth.admin;

  const { data: existing, error: lookupError } = await admin.getUserById(profileId);
  if (isNotFound(lookupError) || (!lookupError && !existing?.user)) {
    await markResolved(service, profileId, staffProfileId);
    return { state: 'removed', banned: false };
  }

  let banned = false;
  if (!lookupError) {
    const { error: banError } = await admin.updateUserById(profileId, { ban_duration: PERMANENT_BAN_DURATION });
    banned = !banError;
  }

  const { error: deleteError } = await admin.deleteUser(profileId);
  if (!deleteError || isNotFound(deleteError)) {
    await markResolved(service, profileId, staffProfileId);
    return { state: 'removed', banned };
  }

  await recordFailure(service, profileId, deleteError.message ?? 'Auth user deletion failed');
  return { state: 'removal_pending', banned };
}

async function markResolved(service: SupabaseClient, profileId: string, staffProfileId: string) {
  await service
    .from('pending_auth_deletions')
    .update({ status: 'resolved', resolved_by: staffProfileId, resolved_at: new Date().toISOString() })
    .eq('auth_user_id', profileId)
    .eq('status', 'pending');
}

async function recordFailure(service: SupabaseClient, profileId: string, message: string) {
  const nowIso = new Date().toISOString();
  const { data: row } = await service.from('pending_auth_deletions').select('id, attempts').eq('auth_user_id', profileId).maybeSingle();
  if (row) {
    await service
      .from('pending_auth_deletions')
      .update({ status: 'pending', last_attempted_at: nowIso, attempts: (row as { attempts: number }).attempts + 1, last_error: message })
      .eq('id', (row as { id: string }).id);
  } else {
    await service
      .from('pending_auth_deletions')
      .insert({ auth_user_id: profileId, first_attempted_at: nowIso, last_attempted_at: nowIso, last_error: message });
  }
}
