'use client';

import { useState, type FormEvent } from 'react';
import { PARTNER_PLATFORMS } from '@/lib/partner-programme';
import { BODY, BOX, BUTTON, INPUT, LABEL } from '../ui';

const PLATFORM_LABELS: Record<(typeof PARTNER_PLATFORMS)[number], string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
  facebook: 'Facebook',
  other: 'Other',
};

export default function ApplyForm() {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    const res = await fetch('/api/partners/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.get('name'),
        email: form.get('email'),
        platform: form.get('platform'),
        profileUrl: form.get('profileUrl'),
        audience: form.get('audience'),
        confirmedAdult: form.get('confirmedAdult') === 'on',
        confirmedUk: form.get('confirmedUk') === 'on',
        acceptedTerms: form.get('acceptedTerms') === 'on',
      }),
    }).catch(() => null);
    const body = res ? await res.json().catch(() => null) : null;
    setBusy(false);
    if (!res?.ok) {
      setError((body && typeof body.error === 'string' && body.error) || 'Could not send your application — please try again.');
      return;
    }
    setDone(true);
  };

  if (done) {
    return (
      <div style={BOX} role="status">
        <strong>Thanks, we&rsquo;ve got your application.</strong> We review every creator by hand and will email you within a few
        working days. Once you&rsquo;re approved, sign in at emblem.cards/partners with the same email to see your code.
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 16, marginTop: 20 }}>
      <div>
        <label style={LABEL} htmlFor="name">Your name</label>
        <input id="name" name="name" required minLength={2} maxLength={100} style={INPUT} autoComplete="name" />
      </div>
      <div>
        <label style={LABEL} htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required maxLength={254} style={INPUT} autoComplete="email" />
      </div>
      <div>
        <label style={LABEL} htmlFor="platform">Main platform</label>
        <select id="platform" name="platform" required style={INPUT} defaultValue="">
          <option value="" disabled>Choose one</option>
          {PARTNER_PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>)}
        </select>
      </div>
      <div>
        <label style={LABEL} htmlFor="profileUrl">Link to your profile</label>
        <input id="profileUrl" name="profileUrl" type="url" required placeholder="https://www.tiktok.com/@yourname" maxLength={300} style={INPUT} />
      </div>
      <div>
        <label style={LABEL} htmlFor="audience">Who follows you?</label>
        <textarea id="audience" name="audience" required minLength={10} maxLength={1000} rows={4} style={INPUT}
          placeholder="e.g. grassroots coaches and parents of U8–U12 players, mostly in the North West" />
        <p style={{ ...BODY, fontSize: 13, marginTop: 4 }}>Please don&rsquo;t include anything about your children.</p>
      </div>
      <label style={{ ...BODY, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <input type="checkbox" name="confirmedAdult" required style={{ marginTop: 6 }} /> I&rsquo;m 18 or over and I run this account myself.
      </label>
      <label style={{ ...BODY, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <input type="checkbox" name="confirmedUk" required style={{ marginTop: 6 }} /> I&rsquo;m based in the UK.
      </label>
      <label style={{ ...BODY, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <input type="checkbox" name="acceptedTerms" required style={{ marginTop: 6 }} /> I&rsquo;ve read and accept the partner terms below, including labelling every post as an ad.
      </label>
      {error && <p role="alert" style={{ ...BODY, color: '#b91c1c' }}>{error}</p>}
      <div>
        <button type="submit" disabled={busy} style={{ ...BUTTON, opacity: busy ? 0.6 : 1 }}>{busy ? 'Sending…' : 'Apply'}</button>
      </div>
    </form>
  );
}
