import { redirect } from 'next/navigation';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';
import type { DeletionPreview } from '@/lib/staff-account-deletion';
import AccountDeletionsView, { type ActionRow, type DecidedRow, type PendingRow } from './AccountDeletionsView';

export const dynamic = 'force-dynamic';

/**
 * Staff home for reviewed account deletions (migrations 0097/0098): an
 * account deletion that something blocks (records that must be kept) waits
 * here with nothing deleted and only coaching access paused. Staff either
 * reject it (the account keeps everything; paused coaching is restored) or,
 * once nothing blocks it, complete it permanently. Counts only: no child
 * names or content are shown.
 */
export default async function AccountDeletionsPage() {
  const session = createClient();
  const staff = await requireStaff(session);
  if (!staff.ok) {
    redirect('/staff/login?next=/staff/account-deletions');
  }

  const service = createServiceRoleClient();
  const { data: pendingData } = await service
    .from('pending_profile_deletions')
    .select('id, auth_user_id, email, blocking_reason, first_detected_at')
    .eq('status', 'pending')
    .order('first_detected_at', { ascending: true });
  const { data: decidedData } = await service
    .from('pending_profile_deletions')
    .select('id, auth_user_id, email, blocking_reason, first_detected_at, status, resolved_at')
    .in('status', ['rejected', 'resolved'])
    .order('resolved_at', { ascending: false })
    .limit(20);
  const { data: authData } = await service.from('pending_auth_deletions').select('auth_user_id').eq('status', 'pending');
  const { data: actionData } = await service
    .from('account_deletion_staff_actions')
    .select('pending_deletion_id, action, outcome, actor_profile_id, created_at')
    .order('created_at', { ascending: false })
    .limit(50);

  const pending = (pendingData ?? []) as PendingRow[];
  const decidedRaw = (decidedData ?? []) as DecidedRow[];
  const decidedUsers = decidedRaw.map((r) => r.auth_user_id);
  const { data: erasedData } = decidedUsers.length
    ? await service.from('erased_accounts').select('profile_id').in('profile_id', decidedUsers)
    : { data: [] };
  // erased_accounts is the authoritative current state. An erased account's
  // review keeps no email (0097 clears it); none is passed to the page even
  // if an older row still had one.
  const erasedIds = new Set(((erasedData ?? []) as { profile_id: string }[]).map((r) => r.profile_id));
  const decided = decidedRaw.map((r) => (erasedIds.has(r.auth_user_id) ? { ...r, email: null } : r));
  const rejectedIds = decided.filter((r) => r.status === 'rejected').map((r) => r.id);
  const { data: openData } = rejectedIds.length
    ? await service.from('deletion_review_access_suspensions').select('pending_deletion_id').in('pending_deletion_id', rejectedIds).is('resolved_at', null)
    : { data: [] };
  const unrestored: Record<string, number> = {};
  for (const r of (openData ?? []) as { pending_deletion_id: string }[]) unrestored[r.pending_deletion_id] = (unrestored[r.pending_deletion_id] ?? 0) + 1;

  // Counts are computed by the database for the signed-in staff member (account_deletion_preview).
  const previews: Record<string, DeletionPreview | null> = {};
  for (const row of pending) {
    const { data, error } = await session.rpc('account_deletion_preview', { p_pending_deletion_id: row.id });
    previews[row.id] = error ? null : (data as DeletionPreview);
  }

  return (
    <AccountDeletionsView
      pending={pending}
      decided={decided}
      signInPending={((authData ?? []) as { auth_user_id: string }[]).map((r) => r.auth_user_id)}
      erased={Array.from(erasedIds)}
      unrestored={unrestored}
      actions={(actionData ?? []) as ActionRow[]}
      previews={previews}
    />
  );
}
