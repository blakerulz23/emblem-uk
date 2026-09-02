import { headers } from 'next/headers';
import { resolveCardSharePublicPage } from '@/lib/card-share-public-page';
import { consumeAnonymousRequestRateLimit } from '@/lib/anonymous-request-rate-limit';

// Technically public, never search-indexed — same convention as the public
// player profile (src/app/player/[publicPlayerId]/page.tsx). Reduces
// incidental discovery beyond "someone who was actually handed the link."
export const metadata = {
  robots: { index: false, follow: false },
};

// Matches the public player profile page's own hardcoded palette exactly,
// for the same reason: this route deliberately lives outside any
// authenticated shell, so it can't rely on shared CSS custom properties.
const COLORS = {
  screen: '#F4F2EE',
  card: '#ffffff',
  ink: '#15130F',
  muted: '#8A8378',
  border: 'rgba(0,0,0,.12)',
  accent: '#E97435',
};

/**
 * Founder-approved public share page (migration 0085) — see that
 * migration's own header comment, and PR history, for the explicit,
 * informed decision this represents: a real per-card page, viewable by
 * anyone with the link, for up to 7 days. Not a Squad Invite feature
 * specifically — this is the shared landing target for BOTH the ordinary
 * builder's and Squad Invite's guardian sharing, since they already share
 * one card-share.ts/eligibility implementation.
 *
 * Expired, revoked, or unknown all render the exact same "no longer
 * available" state with a Make your own card CTA — never distinguishing
 * "never existed" from "existed and expired/was revoked", matching the
 * public player profile page's own rule of never disclosing which case
 * applies.
 */
export default async function CardSharePublicPage({ params }: { params: { token: string } }) {
  const withinLimit = await consumeAnonymousRequestRateLimit(headers(), 'card-share-public-page-view');
  const result = withinLimit ? await resolveCardSharePublicPage(params.token) : { available: false as const };

  return (
    <div style={{ minHeight: '100vh', background: COLORS.screen, display: 'flex', justifyContent: 'center', padding: '28px 16px 48px' }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/emblem-os/emblem-wordmark.png" alt="Emblem" style={{ height: 20, width: 'auto', objectFit: 'contain', opacity: 0.85 }} />
        </div>

        {result.available ? (
          <div style={{ background: COLORS.card, borderRadius: 20, padding: 18, boxShadow: '0 10px 26px -16px rgba(0,0,0,.22)', marginBottom: 20, textAlign: 'center' }}>
            <p style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 11, letterSpacing: '.06em', color: COLORS.accent, textTransform: 'uppercase', margin: '0 0 12px' }}>
              Shared with Emblem
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={result.imageUrl}
              alt="A football card made with Emblem"
              style={{ width: '100%', maxWidth: 320, borderRadius: 16, boxShadow: '0 14px 30px -18px rgba(0,0,0,.35)' }}
            />
          </div>
        ) : (
          <div style={{ background: COLORS.card, borderRadius: 20, padding: '32px 20px', textAlign: 'center', boxShadow: '0 10px 26px -16px rgba(0,0,0,.22)', marginBottom: 20 }}>
            <p style={{ fontFamily: 'Roboto', fontWeight: 700, fontSize: 15, color: COLORS.ink, margin: '0 0 6px' }}>This shared card is no longer available</p>
            <p style={{ fontFamily: 'Roboto', fontSize: 13, color: COLORS.muted, margin: 0 }}>Shared card links stay live for 7 days.</p>
          </div>
        )}

        <a
          href="/builder"
          style={{
            display: 'block', textAlign: 'center', background: COLORS.accent, color: '#fff', fontFamily: 'Roboto', fontWeight: 800,
            fontSize: 15, borderRadius: 999, padding: '14px 20px', textDecoration: 'none',
          }}
        >
          Make your own card
        </a>

        <div style={{ textAlign: 'center', marginTop: 32, fontFamily: 'Barlow Condensed', fontSize: 11, letterSpacing: '.06em', color: COLORS.muted, textTransform: 'uppercase' }}>
          Emblem — football cards, made by you
        </div>
      </div>
    </div>
  );
}
