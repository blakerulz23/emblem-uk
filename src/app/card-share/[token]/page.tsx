import { headers } from 'next/headers';
import { resolveCardSharePublicPage } from '@/lib/card-share-public-page';
import { consumeAnonymousRequestRateLimit } from '@/lib/anonymous-request-rate-limit';

// Technically public, never search-indexed — same convention as the public
// player profile (src/app/player/[publicPlayerId]/page.tsx). Reduces
// incidental discovery beyond "someone who was actually handed the link."
export const metadata = {
  robots: { index: false, follow: false },
};

// Matches the public player profile page's own hardcoded palette exactly —
// this page's own background/card/text colours stay plain literals rather
// than CSS custom properties, since (unlike the reused .emh-eyebrow/
// .emh-btn classes below) they have no equivalent already established
// elsewhere on the site to point at.
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
 * available" state with a Build Your Card CTA — never distinguishing
 * "never existed" from "existed and expired/was revoked", matching the
 * public player profile page's own rule of never disclosing which case
 * applies.
 */
export default async function CardSharePublicPage({ params }: { params: { token: string } }) {
  const withinLimit = await consumeAnonymousRequestRateLimit(headers(), 'card-share-public-page-view');
  const result = withinLimit ? await resolveCardSharePublicPage(params.token) : { available: false as const };

  return (
    // The real site header/footer already render around this page (see
    // ConditionalChrome.tsx's generic branch — this route isn't builder/os/
    // player-profile/home, so it gets the ordinary Navbar+Footer everyone
    // else gets) — this page owns only its own content, never a second
    // logo or footer slogan duplicating what's already there.
    <div style={{ minHeight: '60vh', background: COLORS.screen, display: 'flex', justifyContent: 'center', padding: '32px 16px 56px' }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        {result.available ? (
          <div style={{ background: COLORS.card, borderRadius: 20, padding: 18, boxShadow: '0 10px 26px -16px rgba(0,0,0,.22)', marginBottom: 20, textAlign: 'center' }}>
            <p className="emh-eyebrow" style={{ margin: '0 0 14px', fontSize: 13 }}>
              Shared with Emblem
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={result.imageUrl}
              alt="A football card made with Emblem"
              style={{
                display: 'block',
                // Centred with margin, not a fixed offset, so this holds at
                // every viewport: the panel is only ever as wide as its
                // content up to 440px, but the image caps at 320px well
                // before that on wider screens — without an auto margin a
                // plain block-level <img> narrower than its container sits
                // flush at the start edge instead (confirmed live: an 84px
                // gap on the right only, at a 1280px viewport, not baked
                // into the image itself — the shared image is always a
                // tight 340:476 capture with no padding of its own).
                width: '100%',
                maxWidth: 320,
                margin: '0 auto',
                borderRadius: 16,
                boxShadow: '0 14px 30px -18px rgba(0,0,0,.35)',
              }}
            />
          </div>
        ) : (
          <div style={{ background: COLORS.card, borderRadius: 20, padding: '32px 20px', textAlign: 'center', boxShadow: '0 10px 26px -16px rgba(0,0,0,.22)', marginBottom: 20 }}>
            <p style={{ fontFamily: 'var(--font-manrope), system-ui, sans-serif', fontWeight: 700, fontSize: 15, color: COLORS.ink, margin: '0 0 6px' }}>This shared card is no longer available</p>
            <p style={{ fontFamily: 'var(--font-manrope), system-ui, sans-serif', fontSize: 13, color: COLORS.muted, margin: 0 }}>Shared card links stay live for 7 days.</p>
          </div>
        )}

        {/* Full-width standalone CTA (unlike the compact inline nav button
            this class also styles) — same colour/radius/typography/hover
            state, just a taller, more comfortable touch target since
            there's nothing else beside it competing for space. */}
        <a href="/builder" className="emh-btn emh-btn-primary" style={{ display: 'flex', width: '100%', minHeight: 52, fontSize: 16 }}>
          Build Your Card
        </a>
      </div>
    </div>
  );
}
