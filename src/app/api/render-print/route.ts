import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { randomUUID } from 'crypto';
import { buildPdf, DesignPayload } from '@/lib/pdf-generator';
import { uploadPdf, getSignedDownloadUrl } from '@/lib/s3-client';
import { PRINT_SPECS } from '@/lib/print-specs';
import { consumeAnonymousRequestRateLimit } from '@/lib/anonymous-request-rate-limit';
import { BUILDER_SUBMISSION_COOKIE, verifyBuilderSubmissionCapability } from '@/lib/builder-submission-capability';
import { hasValidBuilderCsrf } from '@/lib/builder-request-security';

export const runtime = 'nodejs';
export const maxDuration = 60;

// A card is captured client-side at 2x an on-screen element (a few hundred
// px), never at print DPI — genuine captures are well under 1MB base64.
// This ceiling matches order-enquiry-validation.ts's own 18MB print-file
// limit for consistency, not this endpoint's real expected payload size.
const MAX_IMAGE_DATA_URL_LENGTH = 24_000_000; // ~18MB decoded, base64-inflated
const DATA_URL_RE = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/]+=*$/;
const MAX_META_STRING_LENGTH = 200;
const META_FIELDS = ['playerName', 'teamName', 'template', 'orderRef'] as const;
// Caller downloads immediately after generation — no legitimate reason to
// keep a print-file link valid for the 7-day SigV4 ceiling other endpoints
// use for genuinely long-lived customer downloads.
const DOWNLOAD_URL_EXPIRY_SEC = 60 * 15;

function isValidImageDataUrl(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= MAX_IMAGE_DATA_URL_LENGTH && DATA_URL_RE.test(v);
}

function isValidMetaString(v: unknown): boolean {
  return v === undefined || (typeof v === 'string' && v.length <= MAX_META_STRING_LENGTH);
}

export async function POST(req: NextRequest) {
  try {
    // CSRF fails before the S3-config check, body parsing, capability
    // verification, rate limiting or PDF generation — a request that can't
    // prove same-origin + a matching double-submit cookie/header pair never
    // gets far enough to consume any of those.
    if (!hasValidBuilderCsrf(req)) {
      return NextResponse.json({ error: 'Request unavailable' }, { status: 403 });
    }
    if (!process.env.AWS_S3_BUCKET) {
      return NextResponse.json({ error: 'print generation is not configured' }, { status: 503 });
    }

    const contentLength = Number(req.headers.get('content-length') || '0');
    if (contentLength > MAX_IMAGE_DATA_URL_LENGTH * 2.2) {
      return NextResponse.json({ error: 'request too large' }, { status: 413 });
    }

    const body = (await req.json()) as DesignPayload & { submissionKey?: string };

    if (!body.product || !PRINT_SPECS[body.product]) {
      return NextResponse.json({ error: 'invalid product' }, { status: 400 });
    }
    if (!isValidImageDataUrl(body.frontImageDataUrl)) {
      return NextResponse.json({ error: 'frontImageDataUrl must be a valid, bounded image data URL' }, { status: 400 });
    }
    if (body.backImageDataUrl !== undefined && !isValidImageDataUrl(body.backImageDataUrl)) {
      return NextResponse.json({ error: 'backImageDataUrl, when provided, must be a valid, bounded image data URL' }, { status: 400 });
    }
    if (body.meta !== undefined) {
      if (typeof body.meta !== 'object' || body.meta === null || Array.isArray(body.meta)) {
        return NextResponse.json({ error: 'meta, when provided, must be an object' }, { status: 400 });
      }
      for (const key of Object.keys(body.meta)) {
        if (!(META_FIELDS as readonly string[]).includes(key)) {
          return NextResponse.json({ error: `meta.${key} is not a recognised field` }, { status: 400 });
        }
      }
      for (const field of META_FIELDS) {
        if (!isValidMetaString(body.meta[field])) {
          return NextResponse.json(
            { error: `meta.${field}, when provided, must be a string under ${MAX_META_STRING_LENGTH} characters` },
            { status: 400 }
          );
        }
      }
    }

    // The ONLY thing that authorises this call: an httpOnly, server-issued
    // capability token (see /api/builder-submissions), never a client-
    // supplied submissionKey string. A submissionKey in the body (if any)
    // is ignored entirely for authorisation and for the S3 key below — the
    // previous version trusted it directly, which meant any caller could
    // invent one. Gate 1 residual pass.
    const capabilityToken = cookies().get(BUILDER_SUBMISSION_COOKIE)?.value;
    const submissionId = await verifyBuilderSubmissionCapability(capabilityToken);
    if (!submissionId) {
      return NextResponse.json({ error: 'A valid submission is required' }, { status: 401 });
    }

    const allowed = await consumeAnonymousRequestRateLimit(req.headers, 'render-print', submissionId);
    if (!allowed) {
      return NextResponse.json({ error: 'too many requests' }, { status: 429 });
    }

    const pdf = await buildPdf(body);

    // Server-derived key only, from the verified capability's own id —
    // never from any client-supplied value.
    const key = `print-files/${submissionId}/${body.product}/${randomUUID()}.pdf`;

    await uploadPdf(key, pdf);
    const url = await getSignedDownloadUrl(key, DOWNLOAD_URL_EXPIRY_SEC);

    return NextResponse.json({
      success: true,
      key,
      downloadUrl: url,
      bytes: pdf.length,
      spec: PRINT_SPECS[body.product],
    });
  } catch (e: unknown) {
    console.error('[render-print] generation failed:', e instanceof Error ? e.message : 'unknown error');
    return NextResponse.json({ error: 'render failed' }, { status: 500 });
  }
}

/** Simple GET to verify the endpoint exists. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: '/api/render-print',
    method: 'POST',
  });
}
