import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { consumeAnonymousRequestRateLimit } from '@/lib/anonymous-request-rate-limit';
import { hasValidBuilderCsrf } from '@/lib/builder-request-security';
import { uploadObject, deleteObject } from '@/lib/s3-client';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * Founder-approved public share page (migration 0085) — creation step.
 * Uploads the already-generated share image (the same front-only capture
 * ShareCardSheet/SquadInviteShareSheet already produce for the native-
 * share/download step — never a second, separately-rendered image) to a
 * fresh, unpredictable S3 key, then calls create_card_share_public_page,
 * which re-verifies eligibility itself server-side before ever persisting
 * anything. If that RPC rejects (ineligible, or the card became
 * suspended/revoked between the client's own check and this call), the
 * just-uploaded object is deleted rather than left orphaned.
 */
export async function POST(request: NextRequest) {
  if (!hasValidBuilderCsrf(request)) return NextResponse.json({ error: 'Request unavailable' }, { status: 403 });

  const body = (await request.json().catch(() => null)) as { orderId?: unknown; imageDataUrl?: unknown } | null;
  const orderId = typeof body?.orderId === 'string' ? body.orderId : '';
  const imageDataUrl = typeof body?.imageDataUrl === 'string' ? body.imageDataUrl : '';
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
    return NextResponse.json({ error: 'Request unavailable' }, { status: 400 });
  }
  const match = /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/]+=*)$/.exec(imageDataUrl);
  if (!match) {
    return NextResponse.json({ error: 'A valid image is required' }, { status: 400 });
  }
  const [, contentType, base64] = match;
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: 'Image is too large' }, { status: 400 });
  }

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    return NextResponse.json({ error: 'Please verify your email first' }, { status: 401 });
  }

  if (!(await consumeAnonymousRequestRateLimit(request.headers, 'card-share-public-page-create', userData.user.email ?? undefined))) {
    return NextResponse.json({ error: 'Request unavailable' }, { status: 429 });
  }

  const extension = contentType === 'image/png' ? 'png' : 'jpg';
  const key = `card-share-public/${randomUUID()}.${extension}`;

  try {
    await uploadObject(key, buffer, contentType);
  } catch (err) {
    console.error('card-share/public-page:upload', err);
    return NextResponse.json({ error: 'Could not prepare the shared page right now' }, { status: 502 });
  }

  const { data, error } = await supabase.rpc('create_card_share_public_page', {
    p_order_id: orderId,
    p_front_image_key: key,
  });

  if (error || !data) {
    // Never leave an orphaned public-facing object behind an ineligible
    // request — best-effort cleanup; a failure here still leaves the
    // object unreachable (nothing in card_share_public_pages points at
    // it), so this is defence in depth, not the only safeguard.
    void deleteObject(key).catch(() => {});
    console.error('create_card_share_public_page failed', error?.message);
    return NextResponse.json({ error: 'Sharing is not available for this card' }, { status: 400 });
  }

  const result = data as { token?: string; expiresAt?: string };
  if (!result.token || !result.expiresAt) {
    void deleteObject(key).catch(() => {});
    return NextResponse.json({ error: 'Could not prepare the shared page right now' }, { status: 502 });
  }

  return NextResponse.json(
    { ok: true, token: result.token, expiresAt: result.expiresAt },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
