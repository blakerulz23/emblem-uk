import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireSquadInvitePermission } from '@/lib/require-squad-invite-permission';
import { isSquadInviteMvpEnabled } from '@/lib/squad-invite-mvp';
import { getPhotoDaySignedUrl } from '@/lib/photo-day-storage';
import { PHOTO_DAY_STAFF_PREVIEW_TTL_SEC, photoDayChildLabel } from '@/lib/photo-day';
import { countPhotoDayPhotos, loadConsentedParticipationIds, loadPhotoDay } from '@/lib/photo-day-staff';
import MatchControl from './MatchControl';
import PublishPhotoDay from './PublishPhotoDay';

const PAGE_SIZE = 48;
type Filter = 'unmatched' | 'matched' | 'all';

/**
 * Staff matching for one Photo Day. Staff see every uploaded photo (they
 * are the ones deciding who is in it) but can only match a photo to a
 * child whose parent has granted, and not withdrawn, Photo Day
 * permission. Parents never see this page or any other child's photo.
 */
export default async function PhotoDayMatching({ params, searchParams }: { params: { reference: string }; searchParams: { filter?: string; page?: string } }) {
  if (!isSquadInviteMvpEnabled()) notFound();
  // Same reviewer-OR-approver read gate and 401/403 split as the detail page.
  const access = await requireSquadInvitePermission(createClient(), ['squad_invite_reviewer', 'squad_invite_approver']);
  if (!access.ok) {
    if (access.status === 401) redirect(`/staff/login?next=/staff/squad-invites/${encodeURIComponent(params.reference)}/photo-day`);
    notFound();
  }
  const service = createServiceRoleClient();
  const { data: r } = await service.from('squad_invite_requests').select('club_team_name,public_reference,campaign_id').eq('public_reference', params.reference).maybeSingle();
  if (!r?.campaign_id) notFound();
  const campaignId: string = r.campaign_id;
  const day = await loadPhotoDay(service, campaignId);
  if (!day) notFound();

  const filter: Filter = searchParams.filter === 'matched' || searchParams.filter === 'all' ? searchParams.filter : 'unmatched';
  const page = Math.max(1, Math.min(100, Number.parseInt(searchParams.page ?? '1', 10) || 1));

  let photosQuery = service.from('squad_invite_photo_day_photos')
    .select('id,storage_key,participation_id,uploaded_at', { count: 'exact' })
    .eq('photo_day_id', day.id).is('deleted_at', null);
  if (filter === 'unmatched') photosQuery = photosQuery.is('participation_id', null);
  if (filter === 'matched') photosQuery = photosQuery.not('participation_id', 'is', null);
  const [{ data: photos, count: filteredCount }, consentedIds, counts] = await Promise.all([
    photosQuery.order('uploaded_at', { ascending: true }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    loadConsentedParticipationIds(service, campaignId),
    countPhotoDayPhotos(service, day.id),
  ]);
  const photoRows = (photos ?? []) as { id: string; storage_key: string; participation_id: string | null; uploaded_at: string }[];

  // Children to offer = consented now. Labels also needed for children
  // already matched on this page (they may have committed since).
  const labelIds = Array.from(new Set(consentedIds.concat(photoRows.map((p) => p.participation_id).filter((x): x is string => Boolean(x)))));
  const { data: participations } = labelIds.length
    ? await service.from('squad_invite_participations')
      .select('id,status,display_first_name,display_surname_initial,squad_number,created_at')
      .eq('campaign_id', campaignId).in('id', labelIds).order('created_at', { ascending: true })
    : { data: [] as never[] };
  const rows = (participations ?? []) as { id: string; status: string; display_first_name: string | null; display_surname_initial: string | null; squad_number: number | null }[];
  const labels = new Map(rows.map((p, i) => [p.id, photoDayChildLabel(p, i)]));
  const consentedSet = new Set(consentedIds);
  const offerable = rows.filter((p) => consentedSet.has(p.id) && p.status === 'started')
    .map((p) => ({ id: p.id, label: labels.get(p.id)! }))
    .sort((a, b) => a.label.localeCompare(b.label, 'en-GB'));

  // Per-child matched totals across the whole day, so staff can spot a child with no photo yet.
  const { data: matchedAll } = await service.from('squad_invite_photo_day_photos').select('participation_id')
    .eq('photo_day_id', day.id).is('deleted_at', null).not('participation_id', 'is', null);
  const perChild = new Map<string, number>();
  for (const m of (matchedAll ?? []) as { participation_id: string }[]) perChild.set(m.participation_id, (perChild.get(m.participation_id) ?? 0) + 1);

  const previews = await Promise.all(photoRows.map(async (p) => {
    try { return await getPhotoDaySignedUrl(p.storage_key, PHOTO_DAY_STAFF_PREVIEW_TTL_SEC); } catch { return null; }
  }));

  const canMatch = ['shooting', 'matching'].includes(day.status);
  const totalPages = Math.max(1, Math.ceil((filteredCount ?? 0) / PAGE_SIZE));
  const href = (f: Filter, p = 1) => `/staff/squad-invites/${encodeURIComponent(params.reference)}/photo-day?filter=${f}&page=${p}`;

  return <div className="mx-auto max-w-6xl px-5 py-12 pb-28">
    <Link href={`/staff/squad-invites/${encodeURIComponent(params.reference)}`} className="text-sm font-bold text-orange-600 hover:text-orange-700">← Back to {r.club_team_name}</Link>
    <p className="mt-4 text-sm font-bold uppercase tracking-widest text-orange-600">Photo Day matching</p>
    <h1 className="mt-1 text-3xl font-bold">{r.club_team_name}</h1>
    <p className="mt-2 text-sm text-neutral-700">{day.venue_label} · {new Date(`${day.scheduled_for}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} · status <span className="font-semibold">{day.status}</span></p>
    <p className="mt-1 text-sm">{counts.uploaded} uploaded · {counts.matched} matched · {offerable.length} child{offerable.length === 1 ? '' : 'ren'} can be matched</p>
    {day.status === 'shooting' && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm font-semibold text-amber-900">Matching the first photo closes uploads. Check the photographer has finished first.</p>}
    {!canMatch && day.status === 'scheduled' && <p className="mt-2 rounded-lg bg-neutral-100 p-2 text-sm">No photos yet.</p>}
    {day.status === 'published' && <p className="mt-2 rounded-lg bg-emerald-50 p-2 text-sm font-semibold text-emerald-900">Published: each parent can see their own child&apos;s matched photos. You can still unmatch a photo to correct a mistake.</p>}
    {day.status === 'matching' && <PublishPhotoDay campaignId={campaignId} matched={counts.matched} childrenWithoutPhotos={offerable.filter((c) => !perChild.get(c.id)).length} />}

    <section aria-labelledby="children-heading" className="mt-6 rounded-2xl border bg-white p-4">
      <h2 id="children-heading" className="font-bold">Children with Photo Day permission</h2>
      {day.status === 'scheduled' && <p className="mt-1 text-sm text-neutral-700">This is the photographer&apos;s shoot list: photograph only these children, and cull any frame showing anyone else before upload.</p>}
      {offerable.length === 0
        ? <p className="mt-1 text-sm text-neutral-600">None yet. Parents give Photo Day permission when they join; children without it are not photographed and cannot be matched.</p>
        : <ul className="mt-2 flex flex-wrap gap-2 text-sm">{offerable.map((c) => {
            const n = perChild.get(c.id) ?? 0;
            return <li key={c.id} className={`rounded-full border px-3 py-1 ${n === 0 ? 'border-amber-400 bg-amber-50' : 'border-emerald-300 bg-emerald-50'}`}>{c.label} · {n} photo{n === 1 ? '' : 's'}</li>;
          })}</ul>}
    </section>

    <nav aria-label="Filter photos" className="mt-6 flex gap-2 text-sm">
      {(['unmatched', 'matched', 'all'] as const).map((f) => (
        <Link key={f} href={href(f)} aria-current={f === filter ? 'page' : undefined}
          className={`rounded-full border px-3 py-1 font-semibold capitalize ${f === filter ? 'border-orange-600 bg-orange-600 text-white' : 'border-neutral-300'}`}>{f}</Link>
      ))}
    </nav>

    {photoRows.length === 0
      ? <p className="mt-4 text-sm text-neutral-600">No {filter === 'all' ? '' : `${filter} `}photos.</p>
      : <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {photoRows.map((p, i) => (
            <li key={p.id} className="rounded-xl border bg-white p-2">
              {previews[i]
                // eslint-disable-next-line @next/next/no-img-element -- short-lived private S3 URL; next/image would proxy and cache it
                ? <a href={previews[i]!} target="_blank" rel="noreferrer noopener"><img src={previews[i]!} alt={`Photo ${(page - 1) * PAGE_SIZE + i + 1}`} loading="lazy" referrerPolicy="no-referrer" className="aspect-[3/4] w-full rounded-lg object-cover" /></a>
                : <div className="flex aspect-[3/4] w-full items-center justify-center rounded-lg bg-neutral-100 text-xs text-neutral-500">Preview unavailable</div>}
              <MatchControl campaignId={campaignId} photoId={p.id} matchedParticipationId={p.participation_id}
                matchedLabel={p.participation_id ? labels.get(p.participation_id) ?? null : null}
                options={offerable} canMatch={canMatch} />
            </li>
          ))}
        </ul>}

    {totalPages > 1 && <nav aria-label="Pages" className="mt-6 flex items-center gap-3 text-sm">
      {page > 1 && <Link href={href(filter, page - 1)} className="font-bold text-orange-600">← Previous</Link>}
      <span>Page {page} of {totalPages}</span>
      {page < totalPages && <Link href={href(filter, page + 1)} className="font-bold text-orange-600">Next →</Link>}
    </nav>}
  </div>;
}
