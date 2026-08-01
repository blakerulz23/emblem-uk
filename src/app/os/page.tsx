import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import OsApp from './OsApp';
import { getOsAccount, getOsData } from '@/lib/os-data';
import { normalizeClaimCode } from '@/lib/claim-code';
import { getRequestIdentifier, isWithinRateLimit, logClaimAttempt } from '@/lib/rate-limit';
import { resolveCardCode } from '@/lib/card-lookup';

export default async function OsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const requestedPlayerId = typeof searchParams?.player === 'string' ? searchParams.player : null;

  // A physical Emblem card taps in as /os?card=CODE. For an already-claimed
  // card this is a genuine redirect, resolved and issued server-side,
  // before ActivationGate (or any client JS) ever mounts — "no intermediate
  // screens" for an existing guardian/coach means literally zero paint of
  // anything else, not just a fast client-side one. An unclaimed card (or
  // one not found at all) falls straight through to the existing
  // ActivationGate flow below, completely unchanged. The claim_token is
  // never referenced again after this redirect fires.
  const rawCardCode = typeof searchParams?.card === 'string' ? searchParams.card : null;
  if (rawCardCode) {
    const code = normalizeClaimCode(rawCardCode);
    const identifier = getRequestIdentifier(headers());
    if (await isWithinRateLimit(identifier)) {
      const result = await resolveCardCode(code);
      await logClaimAttempt(identifier, code, result.status !== 'not_found');
      if (result.status === 'claimed') {
        redirect(`/player/${result.publicPlayerId}`);
      }
    }
    // Rate-limited, unclaimed, not found, or claimed-but-unavailable all
    // fall through — ActivationGate's own ?card= handling (unclaimed) or
    // ClaimCodeEntry's auto-lookup (claimed_unavailable's neutral message)
    // takes it from here, exactly as before.
  }

  const { session, profileRole, hasClaimedPlayer, hasTeam } = await getOsAccount();
  const initialData = await getOsData(session?.userId ?? null, profileRole, requestedPlayerId);

  return (
    <OsApp
      initialData={initialData}
      hasSession={!!session}
      profileRole={profileRole}
      hasClaimedPlayer={hasClaimedPlayer}
      hasTeam={hasTeam}
    />
  );
}
