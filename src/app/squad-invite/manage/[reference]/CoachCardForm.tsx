'use client';
import { useState } from 'react';
import { COACH_CARD_ROLE_PRESETS } from '@/lib/coach-card-draft';

type CoachCardStatus = { fullName: string; roleTitle: string; configurationStatus: string } | null;

/**
 * Submitted once squad_invites.coach_card_eligible flips true (see
 * mark_squad_invite_participation_paid, migration 0059). Only three
 * fields — name, role, photo — the same shape the legacy full-squad
 * builder's own coach-card step collects (CoachCardSection.tsx); "design"
 * is derived server-side (submit_squad_invite_coach_card), never chosen
 * here, since Squad Invite has no per-campaign template gallery to pick from.
 */
export default function CoachCardForm({
  campaignId, csrf, initialStatus, onSubmitted,
}: {
  campaignId: string;
  csrf: string;
  initialStatus: CoachCardStatus;
  onSubmitted: () => void;
}) {
  const [fullName, setFullName] = useState(initialStatus?.fullName ?? '');
  const [role, setRole] = useState(initialStatus && !COACH_CARD_ROLE_PRESETS.includes(initialStatus.roleTitle as (typeof COACH_CARD_ROLE_PRESETS)[number]) ? '__other__' : (initialStatus?.roleTitle ?? ''));
  const [roleOther, setRoleOther] = useState(role === '__other__' ? (initialStatus?.roleTitle ?? '') : '');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const roleTitle = role === '__other__' ? roleOther : role;
  const canSubmit = fullName.trim().length >= 2 && roleTitle.trim().length >= 2 && Boolean(photo);

  const onPhotoChange = (file: File | null) => {
    setPhoto(file);
    setPhotoPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return file ? URL.createObjectURL(file) : '';
    });
  };

  const submit = async () => {
    if (submitting || !canSubmit || !photo) return;
    setSubmitting(true);
    setError('');
    setSuccess(false);
    try {
      const form = new FormData();
      form.set('fullName', fullName.trim());
      form.set('roleTitle', roleTitle.trim());
      form.set('file', photo);
      const response = await fetch(`/api/squad-invites/${encodeURIComponent(campaignId)}/coach-card`, {
        method: 'POST', headers: { 'X-Emblem-CSRF': csrf }, body: form,
      });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setError(body?.error || 'The coach card could not be submitted.');
        return;
      }
      setSuccess(true);
      onSubmitted();
    } catch {
      setError('A network problem stopped the request. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5" aria-busy={submitting}>
      <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Free coach card unlocked</p>
      <p className="mt-1 text-sm text-emerald-900">Add the coach&apos;s details below — Emblem staff will review before it goes into production.</p>
      <div className="mt-4 grid gap-4">
        <label htmlFor="coach-card-full-name" className="block">
          <span className="font-semibold">Coach&apos;s full name</span>
          <input
            id="coach-card-full-name"
            className="mt-1 block w-full rounded-xl border border-neutral-300 p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </label>
        <label htmlFor="coach-card-role" className="block">
          <span className="font-semibold">Their role</span>
          <select
            id="coach-card-role"
            className="mt-1 block w-full rounded-xl border border-neutral-300 p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="">Select a role</option>
            {COACH_CARD_ROLE_PRESETS.filter((preset) => preset !== 'Other').map((preset) => (
              <option key={preset} value={preset}>{preset}</option>
            ))}
            <option value="__other__">Other</option>
          </select>
          {role === '__other__' && (
            <input
              aria-label="Coach's role, other"
              placeholder="e.g. Team welfare officer"
              className="mt-2 block w-full rounded-xl border border-neutral-300 p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
              value={roleOther}
              onChange={(e) => setRoleOther(e.target.value)}
            />
          )}
        </label>
        <label htmlFor="coach-card-photo" className="block">
          <span className="font-semibold">Coach&apos;s photo</span>
          <input
            id="coach-card-photo"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            className="mt-1 block w-full rounded-xl border border-neutral-300 p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
            onChange={(e) => onPhotoChange(e.target.files?.[0] ?? null)}
          />
          {photoPreviewUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- a local blob preview, not a remote asset next/image can optimise
            <img src={photoPreviewUrl} alt="Coach photo preview" className="mt-2 h-24 w-24 rounded-xl object-cover" />
          )}
        </label>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit || submitting}
          className="min-h-[48px] rounded-xl bg-orange-600 p-3 font-bold text-white transition hover:bg-orange-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:opacity-60"
        >
          {submitting ? 'Submitting…' : 'Submit coach card'}
        </button>
        {error && <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>}
        {success && <p role="status" className="text-sm font-semibold text-emerald-700">Submitted — awaiting Emblem staff review.</p>}
      </div>
    </div>
  );
}
