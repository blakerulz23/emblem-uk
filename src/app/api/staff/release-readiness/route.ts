import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';
import {
  AUTHORIZATION_RELATIONSHIPS_CONTRACT,
  AUTHORIZATION_RELATIONSHIPS_SMOKE_CHECKS,
  deployedAppCommit,
} from '@/lib/release-readiness';

export const runtime = 'nodejs';

/**
 * Records, once, that this deployed application has passed its smoke checks
 * for the authorization_relationships_v1 database contract — the record
 * migration 0089 requires before it will run.
 *
 * Only the request's own staff session decides who confirmed, and only the
 * deployment environment decides which commit: any staff id or commit in
 * the body is ignored. The body supplies just the six explicit `true`
 * attestations. The database function re-checks staff membership, every
 * check, the commit format, and that the contract wasn't confirmed before.
 */
export async function POST(request: Request) {
  const supabase = createClient();
  const staffCheck = await requireStaff(supabase);
  if (!staffCheck.ok) {
    return NextResponse.json({ error: staffCheck.error }, { status: staffCheck.status });
  }

  const commit = deployedAppCommit();
  if (!commit) {
    return NextResponse.json({ error: 'The deployed commit is not available in this environment' }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const checks = (body && typeof body === 'object' ? (body as { checks?: unknown }).checks : null) as Record<string, unknown> | null;
  const missing = AUTHORIZATION_RELATIONSHIPS_SMOKE_CHECKS.filter((name) => checks?.[name] !== true);
  if (missing.length) {
    return NextResponse.json({ error: 'Every smoke check must be confirmed as passed', missing }, { status: 400 });
  }

  const { data: confirmedAt, error } = await createServiceRoleClient().rpc('confirm_release_readiness', {
    p_contract: AUTHORIZATION_RELATIONSHIPS_CONTRACT,
    p_app_commit: commit,
    p_confirmed_by: staffCheck.userId,
    p_card_claim: true,
    p_guardian_invite: true,
    p_team_invite: true,
    p_coach_invite: true,
    p_dual_view: true,
    p_team_request_flow: true,
  });
  if (error) {
    if (error.message.includes('already confirmed')) {
      return NextResponse.json({ error: 'Release readiness is already confirmed' }, { status: 409 });
    }
    if (error.message.includes('Not authorized')) {
      return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Could not record release readiness' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, contract: AUTHORIZATION_RELATIONSHIPS_CONTRACT, confirmedAt });
}
