import { NextRequest, NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { hashBuilderToken } from '@/lib/squad-invite';
import { isSquadInviteMvpEnabled } from '@/lib/squad-invite-mvp';
import { hasValidSquadInviteCsrf } from '@/lib/squad-invite-request-security';
import { consumeSquadInviteRateLimit } from '@/lib/squad-invite-rate-limit';
import { isUuid, parsePhotoDayConsentInput, photoDayParentReasonMessage, readRpcOutcome } from '@/lib/photo-day';

/**
 * A parent grants, declines or withdraws Photo Day permission for their own
 * child (record_photo_day_consent, migration 0106). Ownership is proved the
 * same way the commit route proves it: the signed-in guardian AND the
 * httpOnly builder credential, re-hashed here and never read from the body.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isSquadInviteMvpEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!hasValidSquadInviteCsrf(request)) return NextResponse.json({ error: 'Request unavailable' }, { status: 403 });
  if (!isUuid(params.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const token = cookies().get('emblem_squad_builder')?.value;
  if (!token) return NextResponse.json({ error: photoDayParentReasonMessage('participation_not_found') }, { status: 400 });
  if (!(await consumeSquadInviteRateLimit(headers(), 'photo-day-consent', params.id))) {
    return NextResponse.json({ error: 'Please wait a few minutes, then try again.' }, { status: 429 });
  }
  const input = parsePhotoDayConsentInput(await request.json().catch(() => null));
  if (!input) return NextResponse.json({ error: photoDayParentReasonMessage('invalid_child_details') }, { status: 400 });

  const { data, error } = await createServiceRoleClient().rpc('record_photo_day_consent', {
    p_participation_id: params.id,
    p_guardian_profile_id: user.id,
    p_builder_token_hash: hashBuilderToken(token),
    p_granted: input.granted,
    p_first_name: input.granted ? input.firstName : null,
    p_surname_initial: input.granted ? input.surnameInitial : null,
    p_squad_number: input.granted ? input.squadNumber : null,
  });
  if (error) return NextResponse.json({ error: 'Your choice could not be saved. Try again.' }, { status: 500 });
  const outcome = readRpcOutcome(data);
  if (!outcome.ok) return NextResponse.json({ error: photoDayParentReasonMessage(outcome.reason), reason: outcome.reason }, { status: 409 });
  return NextResponse.json({ ok: true, decision: outcome.value.decision }, { headers: { 'Cache-Control': 'no-store' } });
}
