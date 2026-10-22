import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { consumeAnonymousRequestRateLimit } from '@/lib/anonymous-request-rate-limit';
import { enqueueAndDispatchStaffNotification } from '@/lib/dispatch-staff-notification';
import { validateTeamRequestInput } from '@/lib/os-view';
import { logRouteFailure } from '@/lib/route-failure';
import { isPermissionDenied } from '@/lib/permission-denied';

export const runtime = 'nodejs';

const REQUEST_COLUMNS = 'id, status, club_name, team_name, age_group, decision_note, created_at';
const TEAM_REQUEST_FAILED = 'Could not save your request. Please try again.';

/** PostgREST/Postgres answers when coach_team_requests doesn't exist yet (0088 not applied). */
function isMissingTable(code: string | undefined) {
  return code === '42P01' || code === 'PGRST205';
}

/**
 * A coach asks staff for a team (replacing self-service team creation).
 * Written through the person's own session: RLS and 0088's column grants
 * fix the requester to auth.uid() and the status to pending, and allow at
 * most one pending request per person. Staff approve or reject it at
 * /staff/team-requests; nothing here grants any access.
 */
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  if (!(await consumeAnonymousRequestRateLimit(request.headers, 'coach-team-request', user.id))) {
    return NextResponse.json({ error: 'Too many requests — try again in a few minutes' }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const input = validateTeamRequestInput(body);
  if (!input.ok) {
    return NextResponse.json({ error: input.error }, { status: 400 });
  }
  const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : '';

  // coach_team_requests.requester_profile_id references profiles. A brand-
  // new account may not have its row yet: create it with no role (the role
  // is only set if staff approve), keeping any existing row as it is. Then
  // set the name separately: from 0089 a signed-in user may insert only
  // (id, display_name) and update only display_name, so a merge-upsert
  // (which may also SET id) is avoided.
  const { error: profileError } = await supabase.from('profiles').upsert({ id: user.id }, { onConflict: 'id', ignoreDuplicates: true });
  if (profileError) {
    logRouteFailure('team request: profile', profileError);
    return NextResponse.json({ error: TEAM_REQUEST_FAILED }, { status: 500 });
  }
  if (displayName) {
    const { error: nameError } = await supabase.from('profiles').update({ display_name: displayName.slice(0, 80) }).eq('id', user.id);
    if (nameError) {
      logRouteFailure('team request: display name', nameError);
      return NextResponse.json({ error: TEAM_REQUEST_FAILED }, { status: 500 });
    }
  }

  const { data: created, error } = await supabase
    .from('coach_team_requests')
    .insert({
      club_name: input.value.clubName,
      team_name: input.value.teamName,
      age_group: input.value.ageGroup,
      note: input.value.note,
    })
    .select(REQUEST_COLUMNS)
    .single();

  if (error || !created) {
    if (error?.code === '23505') {
      return NextResponse.json({ error: 'You already have a team request waiting for review' }, { status: 409 });
    }
    if (isMissingTable(error?.code)) {
      return NextResponse.json({ error: 'Team requests are temporarily unavailable' }, { status: 503 });
    }
    if (isPermissionDenied(error)) {
      return NextResponse.json({ error: "You don't have permission to submit a team request." }, { status: 403 });
    }
    logRouteFailure('team request: insert', error);
    return NextResponse.json({ error: TEAM_REQUEST_FAILED }, { status: 500 });
  }

  // Best effort: the request is saved whatever happens here, and staff see
  // it on /staff/team-requests regardless of email delivery.
  await enqueueAndDispatchStaffNotification(createServiceRoleClient(), {
    eventType: 'new_coach_team_request',
    eventKey: `new_coach_team_request:${created.id}`,
    subjectId: created.id,
    recipientScope: 'all_staff',
    summary: { clubName: created.club_name, teamName: created.team_name, ageGroup: created.age_group },
    linkPath: '/staff/team-requests',
  });

  return NextResponse.json({ ok: true, request: created }, { status: 201 });
}

/** The signed-in person's own most recent team request (RLS: requester only). */
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('coach_team_requests')
    .select(REQUEST_COLUMNS)
    .eq('requester_profile_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) {
    if (isMissingTable(error.code)) return NextResponse.json({ request: null, available: false });
    logRouteFailure('team request: load', error);
    return NextResponse.json({ error: 'Could not load your team request. Please try again.' }, { status: 500 });
  }
  return NextResponse.json({ request: data?.[0] ?? null, available: true });
}
