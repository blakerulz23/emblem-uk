import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { consumeSquadInviteRateLimit } from '@/lib/squad-invite-rate-limit';
import { hasSquadInviteContextCookie, hasValidSquadInviteCsrf, safeSquadInviteReturnPath } from '@/lib/squad-invite-request-security';

export async function POST(request: NextRequest) {
  if (!hasSquadInviteContextCookie(request) || !hasValidSquadInviteCsrf(request)) return NextResponse.json({ error: 'Verification unavailable' }, { status: 403 });
  const body = await request.json().catch(() => null) as { email?: unknown; code?: unknown; returnTo?: unknown } | null;
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const code = typeof body?.code === 'string' ? body.code.trim() : '';
  if (!(await consumeSquadInviteRateLimit(request.headers, 'otp-verify', email))) {
    return NextResponse.json({ error: 'Verification unavailable' }, { status: 429 });
  }
  if (email.length < 3 || email.length > 254 || !/^\d{6,8}$/.test(code)) {
    return NextResponse.json({ error: 'Verification unavailable' }, { status: 400 });
  }
  const supabase = createClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
  if (error || !data.user) return NextResponse.json({ error: 'Verification unavailable' }, { status: 400 });
  // Same gap, same fix as the organiser-side route (see its own comment):
  // no auto-provisioning trigger exists for profiles, so a first-time
  // guardian would otherwise have no row for squad_invite_participations
  // .guardian_profile_id / squad_invite_permissions.actor_profile_id to
  // reference. ignoreDuplicates is a no-op for a returning guardian.
  const { error: profileError } = await supabase.from('profiles').upsert({ id: data.user.id }, { onConflict: 'id', ignoreDuplicates: true });
  if (profileError) {
    console.error('squad-invite-auth/verify-code:profile-upsert', profileError.code ?? 'unknown');
    return NextResponse.json({ error: 'Verification unavailable' }, { status: 400 });
  }
  return NextResponse.json({ ok: true, returnTo: safeSquadInviteReturnPath(body?.returnTo) }, { headers: { 'Cache-Control': 'no-store' } });
}
