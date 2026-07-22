import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceRoleClient } from '@/lib/supabase/server';

type StaffResult = { ok: true; userId: string } | { ok: false; status: number; error: string };

/**
 * The one authorization check behind every staff-only surface
 * (/staff/queue, /api/orders/[id]/approve, and anything else that acts on
 * an order or triggers a customer-facing email on staff's behalf).
 *
 * Staff membership lives in staff_accounts, not profiles.role — that table
 * has RLS enabled with zero policies, so only this service-role lookup can
 * ever read it. Call this from every staff route individually; don't rely
 * on middleware alone, since API routes must reject unauthorized requests
 * server-side regardless of what the UI shows.
 */
export async function requireStaff(client: SupabaseClient): Promise<StaffResult> {
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return { ok: false, status: 401, error: 'Sign in required' };
  }

  const serviceRole = createServiceRoleClient();
  const { data: staffRow } = await serviceRole
    .from('staff_accounts')
    .select('profile_id')
    .eq('profile_id', user.id)
    .maybeSingle();

  if (!staffRow) {
    return { ok: false, status: 403, error: 'Staff access required' };
  }

  return { ok: true, userId: user.id };
}
