import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { consumeAnonymousRequestRateLimit } from '@/lib/anonymous-request-rate-limit';
import { hasValidBuilderCsrf } from '@/lib/builder-request-security';
import { getObjectBytes, isS3NotFoundError } from '@/lib/s3-client';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * Guardian-controlled card-front sharing (Work Package B, draft) — same-
 * origin image proxy.
 *
 * Fixes a live-preview-verified defect: the shared image reproduced the
 * card design and badge but not the player's photograph. Root cause: by
 * "Order received" time, the photo (and any player-uploaded club crest)
 * has already been moved to S3 and is referenced only by a private
 * storage key — every other reader in this codebase signs a fresh
 * download URL at render time (see migration 0019's comment on
 * card_definitions.photo). That signed URL displays fine as a plain
 * <img>, but html2canvas cannot draw a cross-origin image onto canvas
 * without the bucket's CORS cooperation — confirmed live, via the
 * browser's own console, to be blocked: this app's production bucket
 * correctly does not send Access-Control-Allow-Origin, because these are
 * private, non-public child photos, not something to open up for
 * arbitrary browser origins to read.
 *
 * This route fetches the object from S3 itself — a server-to-server
 * request, where CORS never applies — and returns the bytes from the
 * app's own origin, so the browser's canvas-taint check sees a same-
 * origin response instead. It never trusts a client-supplied key or S3
 * URL: get_card_share_asset_key (migration 0079) re-derives the exact
 * same eligibility check get_card_share_eligibility already performs and
 * resolves the key itself, entirely server-side.
 */
export async function POST(request: NextRequest) {
  if (!hasValidBuilderCsrf(request)) return NextResponse.json({ error: 'Request unavailable' }, { status: 403 });

  const body = await request.json().catch(() => null) as { orderId?: unknown; kind?: unknown } | null;
  const orderId = typeof body?.orderId === 'string' ? body.orderId : '';
  const kind = typeof body?.kind === 'string' ? body.kind : '';
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
    return NextResponse.json({ error: 'Request unavailable' }, { status: 400 });
  }
  if (kind !== 'photo' && kind !== 'badge') {
    return NextResponse.json({ error: 'Request unavailable' }, { status: 400 });
  }

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    return NextResponse.json({ error: 'Please verify your email first' }, { status: 401 });
  }

  if (!(await consumeAnonymousRequestRateLimit(request.headers, 'card-share-photo', userData.user.email ?? undefined))) {
    return NextResponse.json({ error: 'Request unavailable' }, { status: 429 });
  }

  const { data, error } = await supabase.rpc('get_card_share_asset_key', { p_order_id: orderId, p_kind: kind });
  if (error) {
    console.error('card-share/photo:rpc', error.message);
    return NextResponse.json({ error: 'Sharing is not available for this design' }, { status: 400 });
  }

  const key = typeof data === 'string' && data.length > 0 ? data : null;
  if (!key) {
    return NextResponse.json({ error: 'Image not available' }, { status: 404 });
  }

  try {
    const object = await getObjectBytes(key);
    return new NextResponse(new Uint8Array(object.bytes), {
      headers: {
        'Content-Type': object.contentType || 'application/octet-stream',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    if (isS3NotFoundError(err)) {
      return NextResponse.json({ error: 'Image not available' }, { status: 404 });
    }
    // Fixed route label + a safe category only — never the raw S3/SDK
    // error message, never the key, never the order id.
    console.error('card-share/photo:s3', 'fetch_failed');
    return NextResponse.json({ error: 'Could not load image' }, { status: 502 });
  }
}
