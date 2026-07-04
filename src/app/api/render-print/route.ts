import { NextRequest, NextResponse } from 'next/server';
import { buildPdf, DesignPayload } from '@/lib/pdf-generator';
import { uploadPdf, getSignedDownloadUrl } from '@/lib/s3-client';
import { PRINT_SPECS } from '@/lib/print-specs';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as DesignPayload;

    if (!body.product || !PRINT_SPECS[body.product]) {
      return NextResponse.json({ error: 'invalid product' }, { status: 400 });
    }
    if (!body.frontImageDataUrl) {
      return NextResponse.json({ error: 'frontImageDataUrl required' }, { status: 400 });
    }

    const pdf = await buildPdf(body);

    const orderRef = body.meta?.orderRef || Math.random().toString(36).slice(2, 10);
    const key = `print-files/${body.product}/${Date.now()}-${orderRef}.pdf`;

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
