import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { consumeAnonymousRequestRateLimit } from '@/lib/anonymous-request-rate-limit';
import { hasValidBuilderCsrf } from '@/lib/builder-request-security';
import { logBuilderAuthorityStage } from '@/lib/builder-authority-diagnostics';

/**
 * Ordinary-builder Adult Permission step, verify-code. Establishes a real
 * Supabase Auth session for the adult's email — the actual server-side
 * trust boundary the "verified adult email" requirement rests on, not the
 * client-side step UI. record_builder_authority_declaration (migration
 * 0071) requires this exact session (auth.uid()) to exist before it will
 * write anything.
 */
export async function POST(request: NextRequest) {
  logBuilderAuthorityStage('verify-code:received');
  if (!hasValidBuilderCsrf(request)) return NextResponse.json({ error: 'Verification unavailable' }, { status: 403 });
  const body = await request.json().catch(() => null) as { email?: unknown; code?: unknown } | null;
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const code = typeof body?.code === 'string' ? body.code.trim() : '';
  if (!(await consumeAnonymousRequestRateLimit(request.headers, 'builder-authority-otp-verify', email))) {
    logBuilderAuthorityStage('verify-code:rate-limited');
    return NextResponse.json({ error: 'Verification unavailable' }, { status: 429 });
  }
  if (email.length < 3 || email.length > 254 || !/^\d{6,8}$/.test(code)) {
    return NextResponse.json({ error: 'Verification unavailable' }, { status: 400 });
  }
  const supabase = createClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
  if (error || !data.user) {
    logBuilderAuthorityStage('verify-code:otp-rejected');
    return NextResponse.json({ error: 'Verification unavailable' }, { status: 400 });
  }
  // Same gap/fix as squad-invite-auth/verify-code: no auto-provisioning
  // trigger exists for profiles, so a first-time adult here would
  // otherwise have no row for anything that later references profiles.id.
  // ignoreDuplicates is a no-op for a returning adult.
  const { error: profileError } = await supabase.from('profiles').upsert({ id: data.user.id }, { onConflict: 'id', ignoreDuplicates: true });
  if (profileError) {
    logBuilderAuthorityStage('verify-code:profile-upsert-error');
    console.error('builder-authority/verify-code:profile-upsert', profileError.code ?? 'unknown');
    return NextResponse.json({ error: 'Verification unavailable' }, { status: 400 });
  }
  logBuilderAuthorityStage('verify-code:success');
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
