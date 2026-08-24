import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import OsApp from './OsApp';
import { getOsAccount, getOsData } from '@/lib/os-data';
import { normalizeClaimCode } from '@/lib/claim-code';
import { getRequestIdentifier, isWithinRateLimit, logClaimAttempt } from '@/lib/rate-limit';
import { resolveCardCode } from '@/lib/card-lookup';
import { resolvePlayerCapabilities } from '@/lib/player-capabilities';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import CardAccessNotice from './CardAccessNotice';

export default async function OsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  let requestedPlayerId = typeof searchParams?.player === 'string' ? searchParams.player : null;
  // Set true only in the authorised-guardian branch below. Threaded down to
  // ActivationGate so its own (still-needed, for unclaimed cards and
  // manually typed codes) ?card= handling doesn't re-resolve a code this
  // function already resolved and rendered for — see OsApp.tsx/
  // ActivationGate.tsx for why that matters.
  let cardAlreadyResolved = false;

  // A physical Emblem card taps in as /os?card=CODE. Resolved and decided
  // entirely server-side, before ActivationGate (or any client JS) ever
  // mounts — no intermediate screens, no client-side redirect hop, for any
  // outcome. An unclaimed card (or one not found at all) falls straight
  // through to the existing ActivationGate flow below, completely
  // unchanged. The claim_token is never referenced again once a claimed
  // card's branch below has made its decision.
  const rawCardCode = typeof searchParams?.card === 'string' ? searchParams.card : null;
  if (rawCardCode) {
    const code = normalizeClaimCode(rawCardCode);
    const identifier = getRequestIdentifier(headers());
    if (await isWithinRateLimit(identifier)) {
      const result = await resolveCardCode(code);
      await logClaimAttempt(identifier, code, result.status !== 'not_found');
      if (result.status === 'claimed') {
        // The one place this decision is made: is the caller tapping their
        // own card? Resolved from the session, never a client-supplied
        // value. Guardian-only for now (coaches still land on the public
        // profile and use its existing "Open Coach tools" link) — same
        // resolvePlayerCapabilities function the public profile page uses,
        // not a second implementation of the same check.
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const capabilities = await resolvePlayerCapabilities(createServiceRoleClient(), result.playerId, user?.id ?? null);

        if (capabilities.isGuardian) {
          // No redirect — render the personalised OS directly in this same
          // response. Overrides whatever ?player= said (there wasn't one,
          // in the real tap case) so a guardian with multiple children
          // lands on the one this specific card belongs to.
          requestedPlayerId = result.playerId;
          cardAlreadyResolved = true;
        } else {
          redirect(`/player/${result.publicPlayerId}`);
        }
      } else if (result.status === 'card_unavailable') {
        // Suspended/revoked (migration 0075). A stranger, an unrelated
        // authenticated account, or a card with no linked player at all
        // (e.g. staff suspended it before it was ever claimed) all fall
        // through to the exact same generic, no-signal experience as
        // not_found below — no distinction is ever surfaced to anyone who
        // isn't the linked guardian. Only the guardian sees a reassuring,
        // specific screen with a self-service action where one exists.
        if (result.playerId) {
          const supabase = createClient();
          const {
            data: { user },
          } = await supabase.auth.getUser();
          const capabilities = await resolvePlayerCapabilities(createServiceRoleClient(), result.playerId, user?.id ?? null);
          if (capabilities.isGuardian) {
            return <CardAccessNotice cardId={result.cardId} accessStatus={result.accessStatus} />;
          }
        }
        // Falls through with everyone else, below.
      }
    }
    // Rate-limited, unclaimed, not found, claimed-but-unavailable, or
    // card_unavailable-to-a-non-guardian all fall through — ActivationGate's
    // own ?card= handling (unclaimed) or ClaimCodeEntry's auto-lookup
    // (neutral message) takes it from here, exactly as before.
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
      cardAlreadyResolved={cardAlreadyResolved}
    />
  );
}
