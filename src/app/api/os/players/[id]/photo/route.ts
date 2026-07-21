import { NextRequest, NextResponse } from 'next/server';
import { uploadObject } from '@/lib/s3-client';
import { createClient } from '@/lib/supabase/server';

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
 * Uploads a player's card photo to the existing S3 setup and stores the
 * private key on `players.photo_key` — never a public URL, same pattern
 * as moment media (a signed download URL is generated on read). The
 * `players` update relies on the existing "players: guardians can update
 * their player" RLS policy for authorization, via the session-scoped
 * client — no service-role bypass needed here.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
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
    const key = `os-players/${params.id}/${Date.now()}-photo.${extensionFor(file)}`;

    await uploadObject(key, bytes, file.type || 'application/octet-stream');

    const { error } = await supabase.from('players').update({ photo_key: key }).eq('id', params.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not upload player photo';
    return NextResponse.json(
      { error: message.includes('AWS_S3_BUCKET') ? 'Photo storage is not configured' : message },
      { status: 500 }
    );
  }
}
