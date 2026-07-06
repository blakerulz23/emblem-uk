import { NextRequest, NextResponse } from 'next/server';
import { getSignedDownloadUrl, uploadObject } from '@/lib/s3-client';

export const runtime = 'nodejs';
export const maxDuration = 60;

const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

function cleanSegment(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'asset';
}

function extensionFor(file: File) {
  const fromName = file.name.split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  if (file.type === 'image/heic') return 'heic';
  if (file.type === 'image/heif') return 'heif';
  return 'jpg';
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get('file');
    const orderId = cleanSegment(String(form.get('orderId') || 'order'));
    const playerId = cleanSegment(String(form.get('playerId') || 'shared'));
    const kind = cleanSegment(String(form.get('kind') || 'photo'));

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }

    if (!allowedTypes.has(file.type)) {
      return NextResponse.json({ error: 'Only image uploads are supported' }, { status: 400 });
    }

    if (file.size > 18 * 1024 * 1024) {
      return NextResponse.json({ error: 'Image must be under 18MB' }, { status: 413 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const key = `order-assets/${orderId}/${playerId}/${Date.now()}-${kind}.${extensionFor(file)}`;

    await uploadObject(key, bytes, file.type || 'application/octet-stream');
    const url = await getSignedDownloadUrl(key, 60 * 60 * 24 * 14);

    return NextResponse.json({
      ok: true,
      key,
      url,
      contentType: file.type,
      size: file.size,
      fileName: file.name,
      expiresInDays: 14,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not upload order asset';
    return NextResponse.json(
      { error: message.includes('AWS_S3_BUCKET') ? 'Production asset storage is not configured' : message },
      { status: 500 },
    );
  }
}
