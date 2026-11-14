import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Migration 0097: a child-deletion request keeps its contact address
 * (requester_email) only while it is pending; the database clears it in the
 * same write that completes, rejects or cancels the request. A staff route
 * that closes a request reads the address just before, and returns it in its
 * response only once the request has actually closed, so staff can reply.
 * It is never logged or stored anywhere else.
 *
 * Returns null when the request isn't pending, has no address, or the read
 * fails (the closing action itself is unaffected).
 */
export async function readPendingDeletionRequestContact(
  service: SupabaseClient,
  table: 'player_deletion_requests' | 'squad_invite_participation_deletion_requests',
  requestId: string
): Promise<string | null> {
  try {
    const { data, error } = await service.from(table).select('status, requester_email').eq('id', requestId).maybeSingle();
    if (error || !data) return null;
    const row = data as { status?: string | null; requester_email?: string | null };
    return row.status === 'pending' && typeof row.requester_email === 'string' && row.requester_email ? row.requester_email : null;
  } catch {
    return null;
  }
}
