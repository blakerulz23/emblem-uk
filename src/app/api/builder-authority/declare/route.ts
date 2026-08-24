import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { consumeAnonymousRequestRateLimit } from '@/lib/anonymous-request-rate-limit';
import { hasValidBuilderCsrf } from '@/lib/builder-request-security';
import { BUILDER_AUTHORITY_DECLARATION_VERSION, type BuilderAuthorityRelationship } from '@/lib/builder-authority';

const RELATIONSHIPS: BuilderAuthorityRelationship[] = ['parent_guardian', 'coach', 'club_organiser', 'other_adult'];

/**
 * Records the three mandatory confirmations plus the adult's stated
 * relationship to the player, via record_builder_authority_declaration
 * (migration 0071) — requires the Supabase Auth session verify-code
 * already established. Called with the caller's OWN session (never
 * service role): the RPC itself re-derives the verified email from
 * auth.uid(), the same "never trust a client-supplied identity" discipline
 * commit_squad_invite_participation_order already established.
 */
export async function POST(request: NextRequest) {
  if (!hasValidBuilderCsrf(request)) return NextResponse.json({ error: 'Request unavailable' }, { status: 403 });

  const body = await request.json().catch(() => null) as {
    submissionKey?: unknown;
    relationship?: unknown;
    confirmedAgeAndAuthority?: unknown;
    confirmedPhotoPermission?: unknown;
    confirmedCardCreation?: unknown;
  } | null;

  const submissionKey = typeof body?.submissionKey === 'string' ? body.submissionKey : '';
  const relationship = typeof body?.relationship === 'string' ? body.relationship : '';
  if (!/^[0-9a-f-]{36}$/i.test(submissionKey)) {
    return NextResponse.json({ error: 'Request unavailable' }, { status: 400 });
  }
  if (!RELATIONSHIPS.includes(relationship as BuilderAuthorityRelationship)) {
    return NextResponse.json({ error: 'Select who you are to the player' }, { status: 400 });
  }

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    return NextResponse.json({ error: 'Please verify your email first' }, { status: 401 });
  }

  if (!(await consumeAnonymousRequestRateLimit(request.headers, 'builder-authority-declare', userData.user.email ?? undefined))) {
    return NextResponse.json({ error: 'Request unavailable' }, { status: 429 });
  }

  const { data, error } = await supabase.rpc('record_builder_authority_declaration', {
    p_submission_key: submissionKey,
    p_relationship: relationship,
    p_declaration_version: BUILDER_AUTHORITY_DECLARATION_VERSION,
    p_confirmed_age_and_authority: body?.confirmedAgeAndAuthority === true,
    p_confirmed_photo_permission: body?.confirmedPhotoPermission === true,
    p_confirmed_card_creation: body?.confirmedCardCreation === true,
  });

  if (error) {
    console.error('builder-authority/declare:rpc', error.message);
    return NextResponse.json({ error: 'Please confirm all three statements to continue' }, { status: 400 });
  }

  return NextResponse.json({ ok: true, relationship: (data as { relationship?: string } | null)?.relationship }, { headers: { 'Cache-Control': 'no-store' } });
}
