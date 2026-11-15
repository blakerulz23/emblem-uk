'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export type PhotoDaySummary = {
  status: string;
  scheduledFor: string;
  venueLabel: string;
  photographerName: string;
  maxPhotos: number;
  linkExpiresAt: string | null;
  coachPermissionsConfirmedAt: string | null;
  coachPermissionsNote: string | null;
  photosDeleteAfter: string;
  photosDeletedAt: string | null;
  uploaded: number;
  matched: number;
  consentedChildren: number;
};

type Props = {
  campaignId: string;
  reference: string;
  deadlineAt: string | null;
  photoDay: PhotoDaySummary | null;
};

const BUTTON = 'min-h-[44px] rounded-xl border-2 border-orange-600 bg-orange-600 px-4 py-2 font-bold text-white transition hover:bg-orange-700 disabled:opacity-60';
const SECONDARY = 'min-h-[44px] rounded-xl border-2 border-neutral-300 bg-white px-4 py-2 font-bold text-neutral-800 transition hover:bg-neutral-50 disabled:opacity-60';
const INPUT = 'mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2';

const formatDate = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const formatDateTime = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * Staff controls for a campaign's Photo Day (design:
 * docs/architecture/photo-day-design-v0.1.md). Every action calls a route
 * whose database function is the real authority; this panel only shows
 * the current state and the next step.
 */
export default function PhotoDayPanel({ campaignId, reference, deadlineAt, photoDay }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [issuedLink, setIssuedLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const base = `/api/staff/squad-invites/${encodeURIComponent(campaignId)}/photo-day`;

  async function send(path: string, body: unknown): Promise<Record<string, unknown> | null> {
    if (pending) return null;
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      if (!response.ok) {
        setMessage({ text: typeof json?.error === 'string' ? json.error : 'That did not work.', error: true });
        return null;
      }
      return json ?? {};
    } catch {
      setMessage({ text: 'Network error. Try again.', error: true });
      return null;
    } finally {
      setPending(false);
    }
  }

  async function create(form: HTMLFormElement) {
    const data = new FormData(form);
    const ok = await send(base, {
      scheduledFor: data.get('scheduledFor'),
      venueLabel: data.get('venueLabel'),
      photographerName: data.get('photographerName'),
      maxPhotos: data.get('maxPhotos'),
    });
    if (ok) { setMessage({ text: 'Photo day added.', error: false }); router.refresh(); }
  }

  async function confirmCoaches(form: HTMLFormElement) {
    const ok = await send(`${base}/coach-permission`, { note: new FormData(form).get('note') });
    if (ok) { setMessage({ text: 'Coach permission recorded.', error: false }); router.refresh(); }
  }

  async function issue(form: HTMLFormElement) {
    const ok = await send(`${base}/photographer-link`, { action: 'issue', validHours: Number(new FormData(form).get('validHours')) });
    if (ok && typeof ok.uploadUrl === 'string') {
      setIssuedLink({ url: ok.uploadUrl, expiresAt: String(ok.expiresAt) });
      setCopied(false);
      router.refresh();
    }
  }

  async function revoke() {
    if (!window.confirm('Revoke the photographer link? It stops working straight away.')) return;
    const ok = await send(`${base}/photographer-link`, { action: 'revoke' });
    if (ok) { setIssuedLink(null); setMessage({ text: 'Link revoked.', error: false }); router.refresh(); }
  }

  async function copyLink() {
    if (!issuedLink) return;
    try { await navigator.clipboard.writeText(issuedLink.url); setCopied(true); } catch { setCopied(false); }
  }

  const today = new Date().toISOString().slice(0, 10);
  const lastDay = deadlineAt ? deadlineAt.slice(0, 10) : undefined;

  return (
    <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 p-4" aria-busy={pending}>
      <p className="text-xs font-bold uppercase tracking-wide text-sky-800">Photo Day</p>

      {!photoDay && (
        <form className="mt-2 grid gap-3 text-sm" onSubmit={(e) => { e.preventDefault(); void create(e.currentTarget); }}>
          <p className="text-sky-950">A photographer shoots the team on matchday; you match each photo to a child whose parent gave Photo Day permission.</p>
          <label className="font-semibold">Shoot date
            <input name="scheduledFor" type="date" required min={today} max={lastDay} className={INPUT} />
          </label>
          <label className="font-semibold">Venue
            <input name="venueLabel" required minLength={2} maxLength={160} placeholder="e.g. Astley Sports Village, pitch 3" className={INPUT} />
          </label>
          <label className="font-semibold">Photographer
            <input name="photographerName" required minLength={2} maxLength={120} className={INPUT} />
          </label>
          <label className="font-semibold">Photo limit
            <input name="maxPhotos" type="number" min={1} max={1000} defaultValue={400} className={INPUT} />
          </label>
          <div>
            <button type="submit" disabled={pending} className={BUTTON}>{pending ? 'Adding…' : 'Add photo day'}</button>
            <p className="mt-1 text-xs text-sky-900">Requires Approver. One photo day per campaign; the date must be on or before the deadline.</p>
          </div>
        </form>
      )}

      {photoDay && (
        <div className="mt-2 grid gap-4 text-sm">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div><dt className="text-sky-900/70">Date</dt><dd className="font-semibold">{formatDate(photoDay.scheduledFor)}</dd></div>
            <div><dt className="text-sky-900/70">Venue</dt><dd className="font-semibold">{photoDay.venueLabel}</dd></div>
            <div><dt className="text-sky-900/70">Photographer</dt><dd className="font-semibold">{photoDay.photographerName}</dd></div>
            <div><dt className="text-sky-900/70">Status</dt><dd className="font-semibold capitalize">{photoDay.status}</dd></div>
          </dl>
          {photoDay.photosDeletedAt
            ? <p className="text-xs font-semibold text-sky-900">All photos were deleted on {formatDate(photoDay.photosDeletedAt)}.</p>
            : <p className="text-xs text-sky-900">Every photo is deleted automatically on {formatDate(photoDay.photosDeleteAfter)} (30 days after the campaign closes, never more than 60 days after the shoot).</p>}

          <section aria-labelledby="photo-day-coaches">
            <h3 id="photo-day-coaches" className="font-bold">1. Both coaches&apos; permission</h3>
            {photoDay.coachPermissionsConfirmedAt ? (
              <p className="mt-1"><span aria-hidden className="font-bold text-emerald-700">✓ </span>Confirmed {formatDateTime(photoDay.coachPermissionsConfirmedAt)}: {photoDay.coachPermissionsNote}</p>
            ) : (
              <form className="mt-1 grid gap-2" onSubmit={(e) => { e.preventDefault(); void confirmCoaches(e.currentTarget); }}>
                <label className="font-semibold">How did both coaches agree?
                  <textarea name="note" required minLength={5} maxLength={300} rows={2} placeholder="e.g. Both managers agreed by email on 14 Nov; opposition manager by phone" className={INPUT} />
                </label>
                <div><button type="submit" disabled={pending} className={BUTTON}>Confirm both coaches agreed</button></div>
                <p className="text-xs text-sky-900">Uploads stay blocked until this is confirmed.</p>
              </form>
            )}
          </section>

          <section aria-labelledby="photo-day-link">
            <h3 id="photo-day-link" className="font-bold">2. Photographer upload link</h3>
            {photoDay.linkExpiresAt && new Date(photoDay.linkExpiresAt) > new Date()
              ? <p className="mt-1">A link is active until {formatDateTime(photoDay.linkExpiresAt)}.</p>
              : <p className="mt-1">No active link.</p>}
            {issuedLink && (
              <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
                <p className="font-semibold text-amber-900">Copy this link now. It is shown once and works until {formatDateTime(issuedLink.expiresAt)}.</p>
                <p className="mt-1 break-all font-mono text-xs">{issuedLink.url}</p>
                <button type="button" onClick={copyLink} className={`${SECONDARY} mt-2`}>{copied ? 'Copied' : 'Copy link'}</button>
                <p className="mt-1 text-xs text-amber-900">Send it only to the photographer. It can upload photos and nothing else.</p>
              </div>
            )}
            {photoDay.coachPermissionsConfirmedAt && ['scheduled', 'shooting'].includes(photoDay.status) && (
              <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void issue(e.currentTarget); }}>
                <label className="font-semibold">Works for
                  <select name="validHours" defaultValue="48" className={INPUT}>
                    <option value="24">24 hours</option>
                    <option value="48">48 hours</option>
                    <option value="72">3 days</option>
                    <option value="168">7 days</option>
                  </select>
                </label>
                <button type="submit" disabled={pending} className={BUTTON}>{photoDay.linkExpiresAt ? 'Issue a new link (replaces the old one)' : 'Issue link'}</button>
              </form>
            )}
            {photoDay.linkExpiresAt && (
              <button type="button" onClick={revoke} disabled={pending} className={`${SECONDARY} mt-2`}>Revoke link</button>
            )}
          </section>

          <section aria-labelledby="photo-day-matching">
            <h3 id="photo-day-matching" className="font-bold">3. Match photos, then publish to parents</h3>
            <p className="mt-1">{photoDay.uploaded} of {photoDay.maxPhotos} uploaded · {photoDay.matched} matched · {photoDay.consentedChildren} child{photoDay.consentedChildren === 1 ? '' : 'ren'} with Photo Day permission</p>
            <p className="mt-1 text-xs text-sky-900">Matching the first photo closes uploads, so wait until the photographer has finished. Parents see nothing until you publish from the matching page.</p>
            <Link href={`/staff/squad-invites/${encodeURIComponent(reference)}/photo-day`} className="mt-2 inline-block font-bold text-orange-600 hover:text-orange-700">Open matching →</Link>
          </section>
        </div>
      )}

      {message && (
        <p role={message.error ? 'alert' : 'status'} aria-live="polite" className={`mt-2 text-sm font-semibold ${message.error ? 'text-red-700' : 'text-emerald-700'}`}>{message.text}</p>
      )}
    </div>
  );
}
