import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';
import '../../os/os.css';
import { getPublicPlayerProfile } from '@/lib/public-player-profile';
import { resolvePlayerCapabilities } from '@/lib/player-capabilities';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { getRequestIdentifier, isWithinRateLimit } from '@/lib/rate-limit';
import PublicMomentsList from './PublicMomentsList';

// Technically public, never search-indexed — reduces incidental discovery
// beyond "someone who was actually handed the link or tapped the card."
export const metadata = {
  robots: { index: false, follow: false },
};

// Matches Profile.tsx's established light palette exactly (os.css's
// .emblem-os custom properties) — hardcoded here rather than relying on
// those CSS vars, since this page deliberately lives outside the .emblem-os
// tree (it's a standalone public route, not part of the interactive OS
// shell). The os.css import above is only for its Roboto/Barlow Condensed
// @import, so the two surfaces genuinely look like one product.
const COLORS = {
  screen: '#F4F2EE',
  card: '#ffffff',
  ink: '#15130F',
  muted: '#8A8378',
  border: 'rgba(0,0,0,.12)',
  accent: '#E97435',
};

export default async function PublicPlayerProfilePage({ params }: { params: { publicPlayerId: string } }) {
  const identifier = getRequestIdentifier(headers());
  if (!(await isWithinRateLimit(identifier))) {
    notFound();
  }

  const result = await getPublicPlayerProfile(params.publicPlayerId);
  if (!result.ok) {
    // Deliberately identical for 'not_found' and 'disabled' — an
    // administratively hidden profile must read exactly like one that
    // never existed, never disclosing that a decision was made about it.
    notFound();
  }
  const { profile } = result;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const serviceRole = createServiceRoleClient();
  const capabilities = await resolvePlayerCapabilities(serviceRole, profile.playerId, user?.id ?? null);

  const photoUrl = profile.card?.photoUrl ?? profile.photoUrl;
  const initials = profile.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  // Club only — position already lives in the stat row below, matching
  // Profile.tsx's own rule of not repeating a fact between the name-line
  // and the stat-strip.
  const subtitle = profile.club?.name ?? null;

  return (
    <div style={{ minHeight: '100vh', background: COLORS.screen, display: 'flex', justifyContent: 'center', padding: '28px 16px 48px' }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/emblem-os/emblem-wordmark.png" alt="Emblem" style={{ height: 20, width: 'auto', objectFit: 'contain', opacity: 0.85 }} />
        </div>

        <div style={{ background: COLORS.card, borderRadius: 20, padding: 18, boxShadow: '0 10px 26px -16px rgba(0,0,0,.22)', marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 14, marginBottom: 16 }}>
            <div style={{ width: 96, height: 120, borderRadius: 14, background: 'linear-gradient(160deg,#E9C46A,#C98B3A)', flex: '0 0 auto', position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoUrl} alt={profile.name} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }} />
              ) : (
                <span style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 30, color: 'rgba(0,0,0,.35)' }}>{initials}</span>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 19, color: COLORS.ink }}>{profile.name.toUpperCase()}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill={COLORS.accent}>
                  <path d="M12 1l2.5 2.2 3.3-.4 1 3.2 3 1.5-1.2 3.1 1.2 3.1-3 1.5-1 3.2-3.3-.4L12 23l-2.5-2.2-3.3.4-1-3.2-3-1.5 1.2-3.1L2.2 10l3-1.5 1-3.2 3.3.4z" />
                  <path d="M9.5 12.5l1.8 1.8 3.5-3.8" stroke="#fff" strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              {subtitle && <div style={{ fontFamily: 'Roboto', fontWeight: 600, fontSize: 13, color: COLORS.accent, marginTop: 2 }}>{subtitle}</div>}
              {profile.team && (
                <div style={{ fontFamily: 'Roboto', fontSize: 12, color: COLORS.muted, marginTop: 1 }}>
                  {profile.team.name}
                  {profile.team.season ? ` · ${profile.team.season}` : ''}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${COLORS.border}`, borderBottom: `1px solid ${COLORS.border}`, padding: '12px 0', marginBottom: capabilities.isGuardian || capabilities.isCoach ? 14 : 0 }}>
            <div>
              <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 10, color: COLORS.muted }}>SQUAD NUMBER</div>
              <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 14, color: COLORS.ink }}>{profile.squadNumber ?? '—'}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 10, color: COLORS.muted }}>POSITION</div>
              <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 14, color: COLORS.ink }}>{profile.secondaryPosition ? `${profile.position} / ${profile.secondaryPosition}` : (profile.position ?? '—')}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 10, color: COLORS.muted }}>SEASON</div>
              <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 14, color: COLORS.ink }}>{profile.team?.season ?? '—'}</div>
            </div>
          </div>

          {(capabilities.isGuardian || capabilities.isCoach) && (
            <Link
              href={`/os?player=${profile.playerId}`}
              style={{ display: 'block', textAlign: 'center', padding: 11, borderRadius: 11, border: `1px solid ${COLORS.border}`, fontFamily: 'Roboto', fontWeight: 800, fontSize: 13, color: COLORS.ink, textDecoration: 'none' }}
            >
              {capabilities.isGuardian ? 'Open full Player OS →' : 'Open Coach tools →'}
            </Link>
          )}
        </div>

        <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 11, letterSpacing: '.06em', color: COLORS.accent, textTransform: 'uppercase', marginBottom: 10, paddingLeft: 2 }}>
          Timeline
        </div>

        {profile.moments.length === 0 ? (
          <div style={{ background: COLORS.card, borderRadius: 16, padding: '28px 20px', textAlign: 'center', boxShadow: '0 6px 18px -14px rgba(0,0,0,.2)' }}>
            <div style={{ fontFamily: 'Roboto', fontWeight: 700, fontSize: 14, color: COLORS.ink, marginBottom: 4 }}>Nothing public yet</div>
            <p style={{ fontFamily: 'Roboto', fontSize: 12.5, color: COLORS.muted, margin: 0 }}>Moments appear here once a guardian shares them.</p>
          </div>
        ) : (
          <PublicMomentsList moments={profile.moments} playerName={profile.name} />
        )}

        <div style={{ textAlign: 'center', marginTop: 32, fontFamily: 'Barlow Condensed', fontSize: 11, letterSpacing: '.06em', color: COLORS.muted, textTransform: 'uppercase' }}>
          A living football story, by Emblem
        </div>
      </div>
    </div>
  );
}
