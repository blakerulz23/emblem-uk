import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { consumeSquadInviteRateLimit } from '@/lib/squad-invite-rate-limit';
import { hasValidSquadInviteCsrf } from '@/lib/squad-invite-request-security';
import { uploadObject } from '@/lib/s3-client';

export const runtime = 'nodejs';
export const maxDuration = 60;

const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

function extensionFor(file: File) {
  const fromName = file.name.split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  if (file.type === 'image/heic') return 'heic';
  if (file.type === 'image/heif') return 'heif';
  return 'jpg';
}

/**
 * Organiser submission of the free coach card unlocked by
 * squad_invites.coach_card_eligible (see mark_squad_invite_participation_paid,
 * migration 0059). Deliberately NOT built on /api/order-assets — that route
 * has no auth or ownership check at all (any caller can write to any
 * orderId/playerId path it's given), which is fine for a photo already
 * scoped by a builder session but wrong for a new organiser-facing upload.
 * This route does the same CSRF + session + ownership triad every other
 * organiser-write route uses (see flag-concern/route.ts), and builds the S3
 * key itself from the URL's campaign id — never from caller-supplied path
 * segments.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!hasValidSquadInviteCsrf(request)) return NextResponse.json({ error: 'Unavailable' }, { status: 403 });
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  if (!(await consumeSquadInviteRateLimit(request.headers, 'coach-card-submit', user.id))) {
    return NextResponse.json({ error: 'Unavailable' }, { status: 429 });
  }
  const service = createServiceRoleClient();
  const { data: campaign } = await service.from('squad_invites')
    .select('id').eq('id', params.id).eq('organiser_profile_id', user.id).maybeSingle();
  if (!campaign) return NextResponse.json({ error: 'Unavailable' }, { status: 404 });

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Invalid submission' }, { status: 400 });
  const fullName = String(form.get('fullName') || '').trim();
  const roleTitle = String(form.get('roleTitle') || '').trim();
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'A coach photo is required' }, { status: 400 });
  if (!allowedTypes.has(file.type)) return NextResponse.json({ error: 'Only image uploads are supported' }, { status: 400 });
  if (file.size > 18 * 1024 * 1024) return NextResponse.json({ error: 'Image must be under 18MB' }, { status: 413 });

  let photoKey: string;
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    // Server-built path — campaign.id came from the ownership-checked row
    // above, never from the request body, so this can never be pointed at
    // another campaign's storage prefix.
    photoKey = `squad-invite-coach-cards/${campaign.id}/${Date.now()}.${extensionFor(file)}`;
    await uploadObject(photoKey, bytes, file.type || 'application/octet-stream');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not upload the coach photo';
    console.error('squad-invites/coach-card:upload', message.includes('AWS_S3_BUCKET') ? 'storage_not_configured' : 'upload_failed');
    return NextResponse.json({ error: 'The coach photo could not be uploaded right now' }, { status: 500 });
  }

  const { data, error } = await service.rpc('submit_squad_invite_coach_card', {
    p_campaign_id: campaign.id, p_full_name: fullName, p_role_title: roleTitle, p_photo_key: photoKey,
  });
  if (error) return NextResponse.json({ error: error.message || 'The coach card could not be submitted' }, { status: 409 });
  return NextResponse.json({ ok: true, result: data }, { headers: { 'Cache-Control': 'no-store' } });
}
