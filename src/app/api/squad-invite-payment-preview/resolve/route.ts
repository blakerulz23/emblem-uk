import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getSignedDownloadUrl } from '@/lib/s3-client';
import { resolveCardDefinitionLogo } from '@/lib/card-definition-logo';
import { buildSquadInvitePaymentUrl } from '@/lib/squad-invite-payment-link';
import { consumeSquadInviteRateLimit } from '@/lib/squad-invite-rate-limit';
import { hasSafeRequestOrigin } from '@/lib/squad-invite-request-security';
import {
  UNAVAILABLE_PAYMENT_PREVIEW,
  assertSafePaymentPreviewProjection,
  hashSquadInvitePaymentPreviewToken,
} from '@/lib/squad-invite-payment-preview-token';

/**
 * Resolves a Squad Invite payment-preview token (see migration 0081) into
 * just enough to render the "here's your child's card" screen before
 * handing the parent off to Shopify — no session is established here (this
 * is a pure read plus a best-effort audit insert, not a session-creating
 * POST like /api/squad-invite-links/exchange), so no cookies are set.
 *
 * A short-lived, public-facing signed photo URL (15 minutes — matching
 * public-player-profile.ts's own PUBLIC_MEDIA_EXPIRY_SEC reasoning, never
 * the longer authenticated-OS expiry) is resolved here, server-side, from
 * the RPC's raw storage key — signing never happens in SQL.
 *
 * checkoutUrl is rebuilt here from the RPC's own trusted orderRef/tier/
 * printQuantity via the existing, unmodified buildSquadInvitePaymentUrl —
 * never anything client-supplied — so the button on the preview page is
 * guaranteed to land on the exact same Shopify cart permalink the app
 * already builds today.
 */
const PUBLIC_MEDIA_EXPIRY_SEC = 15 * 60;

export async function POST(request: NextRequest) {
  const unavailable = () => NextResponse.json(UNAVAILABLE_PAYMENT_PREVIEW, {
    status: 404,
    headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' },
  });

  if (!hasSafeRequestOrigin(request)) return unavailable();
  if (!(await consumeSquadInviteRateLimit(request.headers, 'payment-preview-resolve'))) return unavailable();

  const body = await request.json().catch(() => null) as { token?: unknown } | null;
  const token = typeof body?.token === 'string' ? body.token : '';
  let hash: string;
  try {
    hash = hashSquadInvitePaymentPreviewToken(token);
  } catch {
    return unavailable();
  }

  const { data, error } = await createServiceRoleClient().rpc('resolve_squad_invite_payment_preview', { p_token_hash: hash });
  if (error || !data) return unavailable();

  let resolved;
  try {
    resolved = assertSafePaymentPreviewProjection(data as Record<string, unknown>);
  } catch {
    // The RPC's own return shape is trusted, but this assertion is
    // belt-and-braces — an unexpected field is treated the same as any
    // other resolve failure, never leaked.
    return unavailable();
  }

  const checkoutUrl = buildSquadInvitePaymentUrl(resolved.tier, resolved.printQuantity, resolved.orderRef);
  if (!checkoutUrl) return unavailable();

  let photoUrl: string | null = null;
  let logo: string | null = null;
  if (resolved.card) {
    try {
      photoUrl = resolved.card.photoStorageKey
        ? await getSignedDownloadUrl(resolved.card.photoStorageKey, PUBLIC_MEDIA_EXPIRY_SEC)
        : null;
    } catch (err) {
      console.error('squad-invite-payment-preview:sign-photo-failed', err instanceof Error ? err.message : err);
    }
    logo = await resolveCardDefinitionLogo(resolved.card.logo, PUBLIC_MEDIA_EXPIRY_SEC);
  }

  return NextResponse.json(
    {
      status: resolved.status,
      teamName: resolved.teamName,
      tier: resolved.tier,
      unitPricePence: resolved.unitPricePence,
      printQuantity: resolved.printQuantity,
      totalPence: resolved.totalPence,
      deadlineAt: resolved.deadlineAt,
      checkoutUrl,
      card: resolved.card ? {
        templateId: resolved.card.templateId,
        sport: resolved.card.sport,
        name: resolved.card.name,
        number: resolved.card.number,
        team: resolved.card.team,
        position: resolved.card.position,
        logo,
        photoUrl,
        photoCrop: resolved.card.photoCrop,
        stats: resolved.card.stats,
      } : null,
    },
    { headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } },
  );
}
