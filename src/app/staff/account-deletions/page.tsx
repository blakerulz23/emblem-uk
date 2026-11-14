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

  // Counts are computed by the database for the signed-in staff member (account_deletion_preview).
  const previews: Record<string, DeletionPreview | null> = {};
  for (const row of pending) {
    const { data, error } = await session.rpc('account_deletion_preview', { p_pending_deletion_id: row.id });
    previews[row.id] = error ? null : (data as DeletionPreview);
  }

  return (
    <AccountDeletionsView
      pending={pending}
      decided={(decidedData ?? []) as DecidedRow[]}
      signInPending={((authData ?? []) as { auth_user_id: string }[]).map((r) => r.auth_user_id)}
      actions={(actionData ?? []) as ActionRow[]}
      previews={previews}
    />
  );
}
