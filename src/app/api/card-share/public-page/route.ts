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
 * Founder-approved public share page (migration 0085, back image added
 * 0087) — creation step. Uploads the already-generated share image(s) —
 * the same front (and, when the template has an approved back per
 * card-face-registry.ts, back) captures ShareCardSheet/
 * SquadInviteShareSheet already produce for the native-share/download
 * step — to fresh, unpredictable S3 keys, then calls
 * create_card_share_public_page, which re-verifies eligibility itself
 * server-side before ever persisting anything. If that RPC rejects
 * (ineligible, or the card became suspended/revoked between the client's
 * own check and this call), every just-uploaded object is deleted rather
 * than left orphaned.
 */
export async function POST(request: NextRequest) {
  if (!hasValidBuilderCsrf(request)) return NextResponse.json({ error: 'Request unavailable' }, { status: 403 });

  const body = (await request.json().catch(() => null)) as { orderId?: unknown; imageDataUrl?: unknown; backImageDataUrl?: unknown } | null;
  const orderId = typeof body?.orderId === 'string' ? body.orderId : '';
  const imageDataUrl = typeof body?.imageDataUrl === 'string' ? body.imageDataUrl : '';
  const backImageDataUrl = typeof body?.backImageDataUrl === 'string' ? body.backImageDataUrl : '';
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
    return NextResponse.json({ error: 'Request unavailable' }, { status: 400 });
  }
  const match = /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/]+=*)$/.exec(imageDataUrl);
  if (!match) {
    return NextResponse.json({ error: 'A valid image is required' }, { status: 400 });
  }
  // Back image is optional — a template with no approved back legitimately
  // has none — but if one WAS sent, it must be well-formed just like the
  // front; a malformed back is never silently dropped.
  const backMatch = backImageDataUrl ? /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/]+=*)$/.exec(backImageDataUrl) : null;
  if (backImageDataUrl && !backMatch) {
    return NextResponse.json({ error: 'A valid back image is required' }, { status: 400 });
  }
  const [, contentType, base64] = match;
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: 'Image is too large' }, { status: 400 });
  }
  let backBuffer: Buffer | null = null;
  let backContentType: string | null = null;
  if (backMatch) {
    backContentType = backMatch[1];
    backBuffer = Buffer.from(backMatch[2], 'base64');
    if (backBuffer.length === 0 || backBuffer.length > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: 'Back image is too large' }, { status: 400 });
    }
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
  const backKey = backBuffer ? `card-share-public/${randomUUID()}.${backContentType === 'image/png' ? 'png' : 'jpg'}` : null;

  try {
    await uploadObject(key, buffer, contentType);
    if (backKey && backBuffer && backContentType) {
      await uploadObject(backKey, backBuffer, backContentType);
    }
  } catch (err) {
    console.error('card-share/public-page:upload', err);
    void deleteObject(key).catch(() => {});
    if (backKey) void deleteObject(backKey).catch(() => {});
    return NextResponse.json({ error: 'Could not prepare the shared page right now' }, { status: 502 });
  }

  let data: unknown;
  let error: { message: string } | null;
  try {
    ({ data, error } = await supabase.rpc('create_card_share_public_page', {
      p_order_id: orderId,
      p_front_image_key: key,
      p_back_image_key: backKey,
    }));
  } catch (err) {
    // A thrown (not returned) error from the RPC call itself — network
    // blip talking to Postgres, a client-library bug — must still clean
    // up the upload(s) and return a real JSON error, never let Next.js's
    // own unhandled-exception page reach the client as an unparseable
    // response.
    void deleteObject(key).catch(() => {});
    if (backKey) void deleteObject(backKey).catch(() => {});
    console.error('create_card_share_public_page threw', err);
    return NextResponse.json({ error: 'Sharing is not available for this card' }, { status: 502 });
  }

  if (error || !data) {
    // Never leave an orphaned public-facing object behind an ineligible
    // request — best-effort cleanup; a failure here still leaves the
    // object unreachable (nothing in card_share_public_pages points at
    // it), so this is defence in depth, not the only safeguard.
    void deleteObject(key).catch(() => {});
    if (backKey) void deleteObject(backKey).catch(() => {});
    console.error('create_card_share_public_page failed', error?.message);
    return NextResponse.json({ error: 'Sharing is not available for this card' }, { status: 400 });
  }

  const result = data as { token?: string; expiresAt?: string };
  if (!result.token || !result.expiresAt) {
    void deleteObject(key).catch(() => {});
    if (backKey) void deleteObject(backKey).catch(() => {});
    return NextResponse.json({ error: 'Could not prepare the shared page right now' }, { status: 502 });
  }

  return NextResponse.json(
    { ok: true, token: result.token, expiresAt: result.expiresAt },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
