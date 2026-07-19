import { NextRequest, NextResponse } from 'next/server';
import { uploadObject } from '@/lib/s3-client';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const allowedTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'video/mp4',
  'video/quicktime',
  'video/webm',
]);

function cleanSegment(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'asset'
  );
}

function extensionFor(file: File) {
  const fromName = file.name.split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  if (file.type === 'image/heic') return 'heic';
  if (file.type === 'image/heif') return 'heif';
  if (file.type === 'video/quicktime') return 'mov';
  if (file.type === 'video/webm') return 'webm';
  if (file.type === 'video/mp4') return 'mp4';
  return 'jpg';
}

/**
 * Uploads one moment's media (photo or video) to the existing S3 setup and
 * returns the private key — not a signed URL. The moment/media DB rows
 * (POST /api/os/moments) are the source of truth for who can later read it
 * back via a signed URL, so this route never returns a durable public link.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }

    const form = await request.formData();
    const file = form.get('file');
    const playerId = cleanSegment(String(form.get('playerId') || 'unknown'));

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }

    if (!allowedTypes.has(file.type)) {
      return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
    }

    const maxBytes = file.type.startsWith('video') ? 200 * 1024 * 1024 : 18 * 1024 * 1024;
    if (file.size > maxBytes) {
      return NextResponse.json({ error: 'File is too large' }, { status: 413 });
    }

    const kind = file.type.startsWith('video') ? 'video' : 'photo';
    const bytes = Buffer.from(await file.arrayBuffer());
    const key = `os-moments/${playerId}/${Date.now()}-${cleanSegment(file.name)}.${extensionFor(file)}`;

    await uploadObject(key, bytes, file.type || 'application/octet-stream');

    return NextResponse.json({ ok: true, key, kind, contentType: file.type, size: file.size });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not upload moment media';
    return NextResponse.json(
      { error: message.includes('AWS_S3_BUCKET') ? 'Media storage is not configured' : message },
      { status: 500 }
    );
  }
}
