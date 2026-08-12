import { NextRequest, NextResponse } from 'next/server';
import { buildPdf, DesignPayload } from '@/lib/pdf-generator';
import { uploadPdf, getSignedDownloadUrl } from '@/lib/s3-client';
import { PRINT_SPECS } from '@/lib/print-specs';

export const runtime = 'nodejs';
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  try {
    // submissionKey is not part of DesignPayload (that type is also handed
    // straight to buildPdf(), which has no reason to know about it) — read
    // it as a sibling field on the same request body, exactly like
    // /api/order-assets reads orderId alongside its upload. Optional: this
    // route also serves src/app/test-print (a dev preview page) and
    // src/components/builder/emblem/PrintFileBlock.tsx (the separate,
    // orphaned collectibles/keychain builder) — neither goes through an
    // order submission, so neither has a submissionKey to send, and their
    // print files never need to pass order-enquiry's asset verification.
    // When present, every print-file key this route produces is namespaced
    // by it, the same "order-assets/<submissionKey>/" idea applied to
    // print-files/, so the server can prove a submitted print-file key
    // belongs to this exact submission before persisting/verifying it.
    const body = (await req.json()) as DesignPayload & { submissionKey?: string };

    if (!body.product || !PRINT_SPECS[body.product]) {
      return NextResponse.json({ error: 'invalid product' }, { status: 400 });
    }
    if (!body.frontImageDataUrl) {
      return NextResponse.json({ error: 'frontImageDataUrl required' }, { status: 400 });
    }
    if (body.submissionKey !== undefined && !UUID_RE.test(body.submissionKey)) {
      return NextResponse.json({ error: 'submissionKey, when provided, must be a valid UUID' }, { status: 400 });
    }

    const pdf = await buildPdf(body);

    const orderRef = body.meta?.orderRef || Math.random().toString(36).slice(2, 10);
    const key = body.submissionKey
      ? `print-files/${body.submissionKey}/${body.product}/${Date.now()}-${orderRef}.pdf`
      : `print-files/${body.product}/${Date.now()}-${orderRef}.pdf`;

    await uploadPdf(key, pdf);
    const url = await getSignedDownloadUrl(key);

    return NextResponse.json({
      success: true,
      key,
      downloadUrl: url,
      bytes: pdf.length,
      spec: PRINT_SPECS[body.product],
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'render failed' }, { status: 500 });
  }
}

/** Simple GET to verify the endpoint exists. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: '/api/render-print',
    method: 'POST',
    products: Object.keys(PRINT_SPECS),
  });
}
