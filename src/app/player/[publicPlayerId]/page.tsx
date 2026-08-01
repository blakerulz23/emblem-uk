import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';
import { getPublicPlayerProfile } from '@/lib/public-player-profile';
import { resolvePlayerCapabilities } from '@/lib/player-capabilities';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { getRequestIdentifier, isWithinRateLimit } from '@/lib/rate-limit';

// Technically public, never search-indexed — reduces incidental discovery
// beyond "someone who was actually handed the link or tapped the card."
export const metadata = {
  robots: { index: false, follow: false },
};

/**
 * PLACEHOLDER composition — this renders correctly and is safe to test end
 * to end (public content only, capability-gated link-out), but the exact
 * shape for an authorized guardian/coach landing here is still an open
 * product question: does this page absorb the full OS toolset inline, or
 * stay a genuinely separate public surface with a one-tap link into the
 * existing /os experience (what's built below)? Not blocking the backend
 * work this was built to verify.
 */
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

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', minHeight: '100vh', padding: '24px 20px', background: '#0f0c0a', color: '#F4F1EC', fontFamily: 'Roboto, system-ui, sans-serif' }}>
      {profile.photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.photoUrl} alt={profile.name} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 16, marginBottom: 16 }} />
      )}

      <h1 style={{ fontSize: 28, fontWeight: 900, margin: '0 0 4px' }}>{profile.name}</h1>
      <div style={{ color: '#E97435', fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
        {[profile.position, profile.squadNumber ? `#${profile.squadNumber}` : null].filter(Boolean).join(' · ')}
      </div>
      {profile.club && <div style={{ fontSize: 14, color: '#B8AE9F' }}>{profile.club.name}</div>}
      {profile.team && (
        <div style={{ fontSize: 13, color: '#B8AE9F', marginBottom: 20 }}>
          {profile.team.name}
          {profile.team.season ? ` · ${profile.team.season}` : ''}
        </div>
      )}

      {(capabilities.isGuardian || capabilities.isCoach) && (
        <Link
          href={`/os?player=${profile.playerId}`}
          style={{ display: 'inline-block', margin: '8px 0 20px', padding: '12px 20px', background: '#E97435', color: '#0B0A09', borderRadius: 12, fontWeight: 800, textDecoration: 'none', fontSize: 14 }}
        >
          {capabilities.isGuardian ? 'Open full Player OS →' : 'Open Coach tools →'}
        </Link>
      )}

      <h2 style={{ fontSize: 16, fontWeight: 800, marginTop: 24, marginBottom: 12 }}>Timeline</h2>
      {profile.moments.length === 0 ? (
        <p style={{ color: '#B8AE9F', fontSize: 14 }}>Nothing public yet.</p>
      ) : (
        profile.moments.map((m) => (
          <div key={m.id} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{m.title}</div>
            {m.occurredOn && <div style={{ fontSize: 12, color: '#B8AE9F' }}>{m.occurredOn}</div>}
            {m.note && <p style={{ fontSize: 13, color: '#B8AE9F' }}>{m.note}</p>}
            {m.media.map((media) =>
              media.kind === 'photo' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={media.id} src={media.url} alt="" style={{ width: '100%', borderRadius: 10, marginTop: 8 }} />
              ) : (
                <video key={media.id} src={media.url} controls style={{ width: '100%', borderRadius: 10, marginTop: 8 }} />
              )
            )}
          </div>
        ))
      )}
    </div>
  );
}
