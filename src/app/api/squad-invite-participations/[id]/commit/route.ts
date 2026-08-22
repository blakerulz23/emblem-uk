import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, createClient } from '@/lib/supabase/server';
import { hashBuilderToken } from '@/lib/squad-invite';
import { cookies } from 'next/headers';
import { hasValidSquadInviteCsrf } from '@/lib/squad-invite-request-security';
import { headObject } from '@/lib/s3-client';

const REQUIRED = [
  ['child_information_authority', 'squad_invite_child_authority_v1'],
  ['photograph_manufacture', 'squad_invite_photo_manufacture_v1'],
  ['consolidated_delivery', 'squad_invite_team_delivery_v1'],
  ['payment_neutral_commitment', 'squad_invite_commitment_v2'],
] as const;

type CommitBody = {
  templateId?: string;
  displayFirstName?: string;
  displaySurnameInitial?: string;
  squadNumber?: number;
  position?: string;
  printQuantity?: number;
  photo?: { storageKey?: string; storageUrl?: string; contentType?: string; fileName?: string; crop?: { x: number; y: number; scale: number }; bgRemoved?: boolean };
  stats?: Record<string, string>;
  accepted?: Record<string, unknown>;
};

/**
 * Persists a Squad Invite commitment into the SAME orders/players/cards/
 * card_definitions tables (and staff approval/production queues) the
 * normal paid builder already uses — see migration
 * 0055_squad_invite_order_commitment.sql's commit_squad_invite_participation_order
 * for why a parallel table set was rejected. This route's own job stays
 * narrow: authenticate the guardian, re-derive the builder-token hash
 * server-side (never trust one from the browser), validate the request
 * shape and required declarations, verify the referenced photo genuinely
 * exists in S3 (the same category of check order-enquiry's
 * verifySubmittedAssetKeys does, scaled down to one required photo), then
 * hand everything to the RPC, which does the actual persistence atomically.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!hasValidSquadInviteCsrf(request)) return NextResponse.json({ error: 'Commitment unavailable' }, { status: 403 });

  // Read-only, httpOnly, 48-hour builder credential set by
  // /api/squad-invite-links/participation's response — never present in
  // the request body, never accepted from client JS. hashBuilderToken is
  // the one already-reviewed SHA-256 algorithm this feature uses
  // everywhere; the raw token itself is never logged or returned.
  const token = cookies().get('emblem_squad_builder')?.value;
  const { data: { user } } = await createClient().auth.getUser();
  const body = (await request.json().catch(() => null)) as CommitBody | null;

  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  if (!token || !body) return NextResponse.json({ error: 'Builder credential and commitment are required' }, { status: 400 });

  const accepted = body.accepted;
  if (!accepted || REQUIRED.some(([purpose]) => accepted[purpose] !== true)) {
    return NextResponse.json({ error: 'All required acknowledgements must be accepted separately' }, { status: 400 });
  }
  if (!body.templateId || !body.displayFirstName || !body.displaySurnameInitial || !body.printQuantity) {
    return NextResponse.json({ error: 'Missing required card details' }, { status: 400 });
  }
  if (!body.photo?.storageKey) {
    return NextResponse.json({ error: 'A photo is required before this can be saved' }, { status: 400 });
  }

  // A forged or stale key must never reach the database write — same
  // reasoning as order-enquiry's asset verification, scaled to one photo.
  try {
    const metadata = await headObject(body.photo.storageKey);
    if (!metadata.exists) return NextResponse.json({ error: 'Photo upload could not be verified' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Photo upload could not be verified' }, { status: 400 });
  }

  const service = createServiceRoleClient();
  const { data, error } = await service.rpc('commit_squad_invite_participation_order', {
    p_participation_id: params.id,
    p_guardian_profile_id: user.id,
    p_builder_token_hash: hashBuilderToken(token),
    p_guardian_email: user.email ?? '',
    p_template_id: body.templateId,
    p_display_first_name: body.displayFirstName.trim(),
    p_display_surname_initial: body.displaySurnameInitial.trim().toUpperCase(),
    p_squad_number: typeof body.squadNumber === 'number' ? body.squadNumber : null,
    p_position: body.position ?? null,
    p_print_quantity: body.printQuantity,
    p_photo: {
      storageKey: body.photo.storageKey,
      storageUrl: body.photo.storageUrl,
      contentType: body.photo.contentType,
      fileName: body.photo.fileName,
      crop: body.photo.crop,
      bgRemoved: body.photo.bgRemoved ?? false,
    },
    p_stats: body.stats ?? {},
  });

  if (error || !data) {
    // Never leak internal database error detail to the client — except
    // this one specific, safe, machine-readable reason (0066). "Retry
    // shortly" is actively wrong once an organiser has closed the
    // campaign, so this is the one rejection worth telling apart from
    // every other generic ineligibility reason, which all still return
    // the same unchanged generic body below.
    console.error('commit_squad_invite_participation_order failed', error?.message);
    if (error?.message === 'campaign closed by organiser') {
      return NextResponse.json({ error: 'Commitment unavailable', reason: 'campaign_closed' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Commitment unavailable' }, { status: 409 });
  }

  const result = data as { created: boolean; orderId: string; cardId: string | null; participationId: string };

  // The early-preview email used to send from here, at commit time — moved
  // to the approve route (approveSquadInviteOrder) because a card created
  // by this RPC isn't claimable yet (resolveCardCode requires the order's
  // payment_status to already be 'fulfilled'), so an email sent from this
  // point always linked to a card that couldn't actually be opened until
  // staff approved it. See commit/route.test.ts's "early preview email
  // ownership" test for the guard against this regressing back here.
  return NextResponse.json({ ok: true, status: 'commitment_completed', paymentTaken: false, created: result.created, orderId: result.orderId });
}
