import { NextRequest, NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { hashBuilderToken } from '@/lib/squad-invite';
import { isSquadInviteMvpEnabled } from '@/lib/squad-invite-mvp';
import { consumeSquadInviteRateLimit } from '@/lib/squad-invite-rate-limit';
import { getObjectBytes } from '@/lib/s3-client';
import { isUuid } from '@/lib/photo-day';
import { loadOwnMatchedPhotoIds } from '@/lib/photo-day-parent';

export const runtime = 'nodejs';

const PRIVATE = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive' };

/**
 * Serves one Photo Day photo to the parent it is matched to, from this
 * app's own origin (the builder draws it on a canvas, which a cross-origin
 * signed S3 URL would block). The photo must be matched to THIS
 * participation, the caller must own the participation (guardian + builder
 * credential) while it is still open, the day must be published and
 * consent must still stand. Anything else gets the same 404, so the route
 * never confirms that some other photo exists.
 */
export async function GET(_request: NextRequest, { params }: { params: { id: string; photoId: string } }) {
  const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404, headers: PRIVATE });
  if (!isSquadInviteMvpEnabled() || !isUuid(params.id) || !isUuid(params.photoId)) return notFound();
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401, headers: PRIVATE });
  const token = cookies().get('emblem_squad_builder')?.value;
  if (!token) return notFound();
  if (!(await consumeSquadInviteRateLimit(headers(), 'photo-day-photo', params.id))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: PRIVATE });
  }

  const service = createServiceRoleClient();
  const { data: participation } = await service.from('squad_invite_participations')
    .select('id,campaign_id,status')
    .eq('id', params.id).eq('guardian_profile_id', user.id).eq('builder_token_hash', hashBuilderToken(token))
    .is('child_data_erased_at', null)
    .maybeSingle<{ id: string; campaign_id: string; status: string }>();
  if (!participation || participation.status !== 'started') return notFound();
  const allowed = await loadOwnMatchedPhotoIds(service, participation);
  if (!allowed.includes(params.photoId)) return notFound();

  const { data: photo } = await service.from('squad_invite_photo_day_photos').select('storage_key')
    .eq('id', params.photoId).eq('participation_id', participation.id).is('deleted_at', null)
    .maybeSingle<{ storage_key: string }>();
  if (!photo) return notFound();
  try {
    const { bytes } = await getObjectBytes(photo.storage_key);
    return new NextResponse(new Uint8Array(bytes), { status: 200, headers: { ...PRIVATE, 'Content-Type': 'image/jpeg' } });
  } catch {
    return NextResponse.json({ error: 'Photo unavailable' }, { status: 503, headers: PRIVATE });
  }
}
