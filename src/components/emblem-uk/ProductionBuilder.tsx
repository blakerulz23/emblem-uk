'use client';

import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CardFace } from '@/lib/card-definition';
import type { CardFaceData } from '@/lib/card-definition';
import { isCustomCollectionTemplateId } from '@/lib/custom-collection-manifest';
import { resolveCustomCollectionBadge } from '@/lib/badge-resolution';
import { DEFAULT_EMJFL_CLUB, EAST_MANCHESTER_LEAGUE, EMJFL_CLUBS, getEmjflClub, preferredTemplateForClub } from '@/lib/emjfl-clubs';
import { DIRECT_BUILDER_MAX_PAID_PLAYERS } from '@/lib/order-enquiry-validation';
import { isHollinwoodTemplateId } from '@/lib/hollinwood-manifest';
import { captureElementToPng, renderPrintFile, BUILDER_CSRF_HEADER, readBuilderCsrfCookie } from '@/lib/print-capture';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { buildUkCardCartUrl } from '@/lib/shopify';
import {
  createPlayer,
  DEFAULT_CUSTOM_TEMPLATE_ID,
  defaultOrder,
  derivePlayerStatus,
  nowIso,
  productionPayload,
  selectedTemplate,
  sportConfig,
  STEP_LABEL,
  statusCopy,
  stepsFor,
  summarizeOrder,
  templates,
  type OrderDraft,
  type OrderType,
  type PlayerDraft,
  type StepId,
  type TemplateId,
} from '@/lib/emblem-uk-builder';
import BackgroundRemovalStep from './builder-steps/BackgroundRemovalStep';
import AdultPermissionStep from './builder-steps/AdultPermissionStep';
import GuardianPendingScreen from './builder-steps/GuardianPendingScreen';
import ShareCardSheet from './ShareCardSheet';
import CoachCardSection from './CoachCardSection';
import PricingSummaryCard from './PricingSummaryCard';
import { useOrderPricingQuote } from './useOrderPricingQuote';
import { isQuoteFreshForCounts, type OrderPricingQuoteState } from '@/lib/pricing-quote-controller';
import { formatPence } from '@/lib/pricing-quote';
import {
  buildCoachCardPayload,
  coachCardTeamOptions,
  emptyCoachCardDraft,
  evaluateCoachCardEligibility,
  isCoachCardDraftComplete,
  reconcileCoachCardTeamSelection,
  selectCoachCardTeam,
  type CoachCardDraft,
} from '@/lib/coach-card-draft';

/**
 * Squad Invite mode — reached from JoinSquadInvite's
 * router.push(`/builder?squadParticipation=${id}`), resolved server-side by
 * builder/page.tsx (which verifies the authenticated guardian owns this
 * participation before ever rendering the builder). Deliberately just a
 * context object plus a few branches in THIS component, not a second
 * builder: templates, PlayerCard rendering, photo upload/crop, background
 * removal and personalisation below are the exact same code path a normal
 * order uses. Only three things are genuinely different in this mode: the
 * step list (no order-type/team choice — always one locked child), the
 * review step's submit target (the authenticated Squad Invite commit route,
 * not /api/order-enquiry), and payment being shown as disabled rather than
 * offered. See supabase/migrations/0055_squad_invite_order_commitment.sql
 * for how that commit route's RPC still lands in the same orders/cards/
 * card_definitions tables and staff approval/production queues a normal
 * order does.
 */
export type SquadInviteBuilderContext = {
  participationId: string;
  campaignClubName: string;
};

const SQUAD_INVITE_STEP_ORDER: StepId[] = ['upload', 'bg-removal', 'personalise', 'review'];

const SQUAD_INVITE_REQUIRED_DECLARATIONS: { purpose: string; label: string }[] = [
  { purpose: 'child_information_authority', label: "I am this child's parent/guardian, or have their parent/guardian's permission to submit these details." },
  { purpose: 'photograph_manufacture', label: 'I have permission for any photograph provided to be used in manufacturing this printed card.' },
  { purpose: 'consolidated_delivery', label: 'I understand this card will be delivered together with the team’s order to the approved organiser/coach, not to me directly.' },
  { purpose: 'payment_neutral_commitment', label: "I understand this is a paid order. A payment request will be emailed to me once the team's price is confirmed, and this card enters production only after that payment is completed." },
];

// emblem_squad_csrf is deliberately non-httpOnly (see
// squad-invite-request-security.ts) specifically so client code can echo it
// back as a header — the same double-submit-cookie pattern every other
// Squad Invite form in this repo uses.
function readSquadInviteCsrfCookie(): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/(?:^|; )emblem_squad_csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : '';
}

type SquadInviteCommitOutcome = null | 'sign_in_required' | 'unavailable' | 'validation' | 'network' | 'photo_upload_failed' | 'campaign_closed';

const orderTypes: Array<{ id: OrderType; title: string; copy: string; icon: 'person' | 'group' }> = [
  { id: 'single', title: 'One player', copy: 'Create one card from one football photo.', icon: 'person' },
  { id: 'squad', title: 'A whole team', copy: 'Build sibling sets, friend groups, or the full squad in one session.', icon: 'group' },
];

const collections = [
  {
    id: 'custom',
    title: 'Custom Collection',
    proof: 'Build Your Own',
    points: ['Any club or school', 'One-off events', 'Emblem badge included'],
  },
  {
    id: 'official',
    title: 'Official Collection',
    proof: 'Official Partner',
    points: ['Licensed badges', 'Official templates', 'League approved'],
  },
] as const;

// squad's maxPlayers matches DIRECT_BUILDER_MAX_PAID_PLAYERS exactly — the
// same server-enforced pilot cap (order-enquiry-validation.ts), not a
// second, independently-chosen number. A customer who somehow reaches
// this client-side ceiling still can't exceed it server-side either way,
// but keeping the two in sync means they're stopped with an
// understandable message here rather than a late rejection at submit.
const orderModeLimits: Record<OrderType, { maxPlayers: number; rosterCopy: string }> = {
  single: { maxPlayers: 1, rosterCopy: 'Single orders are capped at one approved card.' },
  set: { maxPlayers: 6, rosterCopy: 'Sets are built for two to six cards in one session.' },
  squad: { maxPlayers: DIRECT_BUILDER_MAX_PAID_PLAYERS, rosterCopy: 'Squad orders support bulk photo upload and team-level approval.' },
};

type CardSide = 'front' | 'back';
type EnquiryStatus = 'idle' | 'sending' | 'sent' | 'error';
type UploadedOrderAsset = {
  key: string;
  url: string;
  contentType?: string;
  fileName?: string;
  size?: number;
};

// Small inline read of the same quote state PricingSummaryCard renders in
// full — used only for compact single-value spots (the snapshot grid cell,
// the handoff-box recap) that can't host the whole card's layout. Never
// invents a price: 'loading'/'error'/'idle' all render as non-numeric text.
function quoteSubtotalLabel(state: OrderPricingQuoteState): string {
  switch (state.status) {
    case 'ready':
      return formatPence(state.quote.subtotalPence);
    case 'loading':
      return 'Calculating…';
    case 'error':
      return 'Unavailable';
    default:
      return '—';
  }
}

function statusClass(status: string) {
  return `builder-status builder-status-${status}`;
}

function canAddPlayer(order: OrderDraft) {
  return order.players.length < orderModeLimits[order.type].maxPlayers;
}

function nextClubId(order: OrderDraft) {
  const used = new Set(order.players.map((player) => player.emjflClubId).filter(Boolean));
  return EMJFL_CLUBS.find((club) => !used.has(club.id))?.id || DEFAULT_EMJFL_CLUB.id;
}

function playerLabel(player: PlayerDraft, index?: number) {
  return player.name.trim() || `Player ${typeof index === 'number' ? index + 1 : 1}`;
}

function missingItems(player: PlayerDraft) {
  const missing: string[] = [];
  if (!player.photo?.srcUrl) missing.push('photo');
  if (!player.name.trim()) missing.push('name');
  if (!player.kitNo.trim()) missing.push('kit number');
  if (!player.position.trim()) missing.push('position');
  return missing;
}

function completionScore(player: PlayerDraft) {
  const fields = [Boolean(player.photo?.srcUrl), Boolean(player.name.trim()), Boolean(player.kitNo.trim()), Boolean(player.position.trim())];
  return Math.round((fields.filter(Boolean).length / fields.length) * 100);
}

function reviewActionCopy(player: PlayerDraft) {
  const missing = missingItems(player);
  if (missing.includes('photo')) return 'Add photo';
  if (missing.length > 0) return `Add ${missing[0]}`;
  return 'Continue editing';
}

function playerClubId(order: OrderDraft, player?: PlayerDraft) {
  if (order.collectionType === 'custom') {
    const club = (player?.club || order.club).trim();
    return club ? `custom:${club.toLowerCase()}` : `custom:${player?.id || 'collection'}`;
  }
  return player?.emjflClubId || order.emjflClubId || DEFAULT_EMJFL_CLUB.id;
}

function playerClubName(order: OrderDraft, player?: PlayerDraft) {
  if (order.collectionType === 'custom') return player?.club || order.club || 'Custom Collection';
  return player?.club || getEmjflClub(playerClubId(order, player)).name || order.club;
}

/**
 * Approved product rule, not a bug: a badge-less Custom Collection card
 * must never go to print with an empty badge slot, so this — and only
 * this, live-Builder-preview and print-capture path — falls back to the
 * generic Football Collection placeholder. card_definitions.logo (what
 * Emblem OS reads, via cardDefinitionToFaceData in card-definition.tsx)
 * is never passed through this fallback and is written as a plain null
 * when no badge was uploaded (src/app/api/order-enquiry/route.ts) — Emblem
 * OS is expected to show no badge in that case. Do not "fix" this
 * difference by adding the placeholder to Emblem OS or by removing it
 * from print; both sides are working as intended.
 */
export function playerBadge(order: OrderDraft, player?: PlayerDraft) {
  if (order.collectionType === 'custom') return resolveCustomCollectionBadge(player?.badgeUrl, order.badgeUrl);
  return player?.badgeUrl || (player?.emjflClubId ? getEmjflClub(player.emjflClubId).badgePath : order.badgeUrl) || getEmjflClub(playerClubId(order, player)).badgePath;
}

function groupPlayersByClub(order: OrderDraft, players: PlayerDraft[]) {
  const groups = new Map<string, { id: string; name: string; badge: string; players: PlayerDraft[] }>();

  players.forEach((player) => {
    const id = playerClubId(order, player);
    const existing = groups.get(id);
    if (existing) {
      existing.players.push(player);
      return;
    }
    groups.set(id, {
      id,
      name: playerClubName(order, player),
      badge: playerBadge(order, player),
      players: [player],
    });
  });

  return Array.from(groups.values());
}

function isLocalAssetUrl(url?: string) {
  return Boolean(url && (url.startsWith('blob:') || url.startsWith('data:')));
}

/**
 * Thrown only when an upload request genuinely reached /api/order-assets
 * and the server responded with a non-ok status (e.g. storage
 * misconfigured, file rejected) — distinct from fetch() itself rejecting
 * (no connectivity, DNS/CORS failure), which throws a plain/native error
 * instead. Callers use this distinction to label the two cases correctly
 * rather than collapsing both into a generic "network problem" — an HTTP
 * failure is a server/config issue, not the guardian's connection.
 */
class OrderAssetUploadHttpError extends Error {}

async function uploadOrderAsset(sourceUrl: string, meta: { orderId: string; playerId: string; kind: 'photo' | 'badge'; fileName?: string }) {
  const source = await fetch(sourceUrl);
  if (!source.ok) throw new Error(`Could not read ${meta.kind} upload`);
  const blob = await source.blob();
  const fileName = meta.fileName || `${meta.kind}.${blob.type.split('/')[1] || 'jpg'}`;
  const file = new File([blob], fileName, { type: blob.type || 'image/jpeg' });
  const form = new FormData();
  form.append('file', file);
  form.append('orderId', meta.orderId);
  form.append('playerId', meta.playerId);
  form.append('kind', meta.kind);

  const response = await fetch('/api/order-assets', {
    method: 'POST',
    headers: { [BUILDER_CSRF_HEADER]: readBuilderCsrfCookie() },
    body: form,
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new OrderAssetUploadHttpError(result?.error || `Could not upload ${meta.kind}`);
  }
  return result as UploadedOrderAsset;
}

export default function ProductionBuilder({
  squadInviteEnabled = false,
  squadInviteContext,
}: {
  squadInviteEnabled?: boolean;
  squadInviteContext?: SquadInviteBuilderContext;
}) {
  const searchParams = useSearchParams();
  const [order, setOrder] = useState<OrderDraft>(() => {
    const draft = defaultOrder();
    if (squadInviteContext) {
      // Locked: one child, Custom Collection, club name fixed to the
      // campaign's own club/team — never the curated EMJFL official-league
      // picker (a Squad Invite campaign's club is organiser-typed free
      // text, not necessarily one of that curated list).
      return { ...draft, type: 'single', collectionType: 'custom', collectionName: 'Custom Collection', club: squadInviteContext.campaignClubName };
    }
    const mode = searchParams.get('mode');
    if (mode === 'set' || mode === 'friend-set' || mode === 'siblings') {
      return { ...draft, type: 'set' };
    }
    if (mode === 'squad' || mode === 'team' || mode === 'group') {
      return { ...draft, type: 'squad' };
    }
    return draft;
  });
  // A marketing entry point can still skip straight to the photo-upload
  // step via ?step=upload if one is ever added — the order-type/collection
  // steps ahead of it are never a required gate (every field already has a
  // sensible default from defaultOrder()), so this reuses the same
  // initial-state-from-searchParams pattern as `mode` above rather than
  // adding a second entry flow. No current CTA uses it: the homepage hero
  // link now points at plain /builder so every marketing entry point lands
  // on Step 1 (order-type) consistently. Squad Invite mode always starts on
  // Upload — order-type/collection are never reachable steps in that mode
  // (see stepOrder below), not merely hidden.
  const [activeStepId, setActiveStepId] = useState<StepId>(() => {
    if (squadInviteContext) return 'upload';
    return searchParams.get('step') === 'upload' ? 'upload' : 'order-type';
  });
  const [squadInviteAccepted, setSquadInviteAccepted] = useState<Record<string, boolean>>({});
  const [squadInvitePhase, setSquadInvitePhase] = useState<'form' | 'success'>('form');
  const [squadInviteOutcome, setSquadInviteOutcome] = useState<SquadInviteCommitOutcome>(null);
  const [squadInviteSubmitting, setSquadInviteSubmitting] = useState(false);
  const squadInviteSubmittingRef = useRef(false);
  // Which declarations were still unchecked on the last failed submit
  // attempt — drives the per-row invalid state and the summary error, and
  // is cleared the moment all four are accepted again.
  const [squadInviteDeclarationErrors, setSquadInviteDeclarationErrors] = useState<Record<string, boolean>>({});
  const squadInviteDeclarationRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [selectedId, setSelectedId] = useState(order.players[0]?.id || '');
  const [cardSide, setCardSide] = useState<CardSide>('front');
  const [enquiryStatus, setEnquiryStatus] = useState<EnquiryStatus>('idle');
  // Adult Permission step (migration 0071) — set once record_builder_authority_declaration
  // has genuinely succeeded server-side, never just because the three
  // checkboxes are ticked client-side. Gates the review form's actual
  // submission (handleReviewFormSubmit below); the checkboxes themselves
  // are UX, this flag plus the server-side RPC check are the real gate.
  const [adultPermissionConfirmed, setAdultPermissionConfirmed] = useState(false);
  // Captured from /api/order-enquiry's response once an order is created,
  // so the review step can show the Guardian Pending screen instead of the
  // ordinary "Order received" success content for a non-guardian submitter.
  const [submittedOrderId, setSubmittedOrderId] = useState<string | null>(null);
  const [submittedAuthorityStatus, setSubmittedAuthorityStatus] = useState<string | null>(null);
  // Stage 6 — one cryptographically random idempotency key per builder
  // submission attempt, generated once and reused for every retry (never
  // regenerated just because a network response was lost, never the old
  // hardcoded 'emblem-local-order' order.id). Also doubles as the S3 asset
  // namespace: every player/coach photo this session uploads is keyed
  // under order-assets/<submissionKey>/, so no two customers can ever
  // collide, and the server rejects any submitted photo key that doesn't
  // start with this exact prefix.
  //
  // Gate 1 residual pass: this used to be a bare crypto.randomUUID()
  // generated here in the browser and trusted directly by the server —
  // anyone could invent any value. It's now the PUBLIC id of a real,
  // server-issued capability (see /api/builder-submissions and
  // src/lib/builder-submission-capability.ts); the actual secret that
  // authorises order-assets/render-print calls lives only in an httpOnly
  // cookie the browser attaches automatically, never read or held by this
  // component. ensureSubmissionKey() below issues it once (kicked off
  // eagerly on mount) and every submit path awaits it before proceeding.
  // No component state here deliberately — nothing renders this id, every
  // consumer is inside an async submit path that awaits ensureSubmissionKey()
  // directly, so a cached Promise in a ref is sufficient and avoids an
  // unused, write-only state variable.
  const submissionCapabilityRef = useRef<Promise<string> | null>(null);
  const ensureSubmissionKey = async (): Promise<string> => {
    if (submissionCapabilityRef.current) return submissionCapabilityRef.current;
    const promise = (async () => {
      // fetchWithTimeout bounds this call — previously a hung request here
      // (e.g. a slow/stuck rate-limit RPC server-side) never settled at
      // all, leaving any caller awaiting this promise (handleConfirm in
      // AdultPermissionStep.tsx included) permanently stuck with no error
      // and no way to recover, exactly what the live preview exposed.
      const response = await fetchWithTimeout('/api/builder-submissions', {
        method: 'POST',
        headers: { [BUILDER_CSRF_HEADER]: readBuilderCsrfCookie() },
      });
      if (!response.ok) throw new Error('Could not start a new order session');
      const data = await response.json();
      return data.submissionId as string;
    })();
    submissionCapabilityRef.current = promise;
    promise.catch(() => {
      // Allow a later retry to re-issue rather than staying poisoned by one
      // transient failure.
      submissionCapabilityRef.current = null;
    });
    return promise;
  };
  useEffect(() => {
    ensureSubmissionKey().catch(() => {});
    // Mount-once: issuance itself is idempotent-safe to retry from any
    // later call site, so this deliberately doesn't re-run on state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Set only on a 409 "same key, different content" response — a genuine
  // conflict, not an ordinary retryable network/server failure. Distinct
  // from enquiryStatus === 'error' so the UI never tells a customer to
  // just "try again" when retrying the identical request would only
  // repeat the same conflict forever (the key is already bound to
  // whatever content the server committed under it).
  const [enquiryConflict, setEnquiryConflict] = useState(false);
  // Print-capture rig: rendered off-screen only while a submit is in
  // flight, so html2canvas has a full-size, image-loaded card DOM to
  // rasterise for each approved player. Captures happen BEFORE the photo
  // assets are swapped to S3 URLs — local blob:/data: sources keep the
  // canvas untainted without needing S3 CORS configuration.
  const [captureMode, setCaptureMode] = useState(false);
  const captureRefs = useRef(new Map<string, HTMLDivElement>());
  // Guardian-controlled card-front sharing (Work Package B, draft) — a
  // second, deliberately separate off-screen rig from the print-capture one
  // above, sharing no mutable state with it, so nothing about the share
  // path can ever interfere with a print submission in flight. Captures at
  // a lower pixelRatio than print (2 vs print's 3) and never calls
  // renderPrintFile — the plain captureElementToPng output already has no
  // bleed/crop marks, since those are added by renderPrintFile alone.
  //
  // Holds the exact player to render for capture, already patched (see
  // captureShareImage) so every image URL it carries is guaranteed local —
  // never the bare approved player straight from state. Sharing only ever
  // becomes possible from the Order received screen, which is reachable
  // only *after* orderWithUploadedAssets has already swapped this same
  // player's photo (and any custom-uploaded badge) from a local blob: URL
  // to a remote, signed URL — exactly the swap the print-capture rig above
  // is deliberately run BEFORE, for the same reason stated in its own
  // comment: a remote image needs the host's CORS policy to cooperate
  // before html2canvas can draw it onto canvas at all, or that layer is
  // silently dropped from the output while the very same <img> still
  // displays fine anywhere else on the page (this is exactly the defect a
  // live preview test found — the photo was missing from the shared image
  // despite being visibly present on the card the guardian was looking
  // at). Share capture cannot run before that swap the way print capture
  // does, so instead it fetches each remote image itself and substitutes a
  // fresh local blob: URL before ever rendering anything here — see
  // captureShareImage.
  const [shareCapturePlayer, setShareCapturePlayer] = useState<PlayerDraft | null>(null);
  const shareCaptureRef = useRef<HTMLDivElement | null>(null);
  // Double-submit guard — a ref, not enquiryStatus state. Two clicks fired
  // on the same tick both run submitEnquiry before React has processed the
  // first setEnquiryStatus('sending') and re-rendered with a fresh
  // closure, so a check against the *state* value is a stale-closure race
  // (confirmed live: it let both clicks through). A ref mutates
  // synchronously and is shared across both invocations, so the second one
  // always sees the first's write.
  const submittingRef = useRef(false);
  // Stage 6 amendment — persistent, component-lifetime asset-upload cache
  // (same lifetime as submissionKey, both reset only by a fresh mount or an
  // explicit "start a new order" action). Keyed by `${kind}:${sourceUrl}` —
  // a player/coach photo's blob: URL is itself a stable identity that only
  // changes when the customer genuinely replaces that photo (a fresh
  // File -> a fresh URL.createObjectURL() result), so this cache is
  // naturally self-invalidating on replace with no extra bookkeeping.
  // Previously this Map was created fresh *inside* orderWithUploadedAssets
  // on every call, so a retry after a lost response re-uploaded every
  // photo under a brand-new S3 key — which changed the submitted photoKey
  // and therefore the idempotency fingerprint on every retry, making an
  // identical retry look like "same key, different content" to the
  // server. Living here instead means a retry that touches nothing finds
  // every entry already cached and reuses the exact same keys.
  const uploadedAssetsRef = useRef(new Map<string, Promise<UploadedOrderAsset>>());
  // Same reasoning, for the print-file capture/render step — keyed by
  // player.id, invalidated only when that player's approvedAt changes
  // (i.e. they were genuinely re-approved after an edit), not on every
  // submit attempt.
  const printFilesRef = useRef(new Map<string, { approvedAt: string | undefined; result: { playerId: string; playerName: string; key: string } }>());
  const [enquiryError, setEnquiryError] = useState('');
  const [enquiry, setEnquiry] = useState({
    name: '',
    email: '',
    phone: '',
    notes: '',
  });
  // Stage 5B — free coach-card details. Lives in its own state, never in
  // `order`/`players`, so it can never be counted as a paid player/print or
  // create a real roster row. Survives eligibility flapping (loading/error/
  // ineligible) by construction — nothing here clears it except the
  // customer removing the photo/team themselves, or reconciliation
  // invalidating a team selection that no longer exists in the order.
  const [coachCardDraft, setCoachCardDraft] = useState<CoachCardDraft>(() => emptyCoachCardDraft());
  const patchCoachCardDraft = (patch: Partial<CoachCardDraft>) => setCoachCardDraft((current) => ({ ...current, ...patch }));

  const selectedPlayer = order.players.find((player) => player.id === selectedId) || order.players[0];
  // Single-player orders skip the team-only "approve" gate (6 steps total);
  // set/squad orders keep it (7 steps) — see stepsFor() in emblem-uk-builder.
  // Squad Invite mode uses its own fixed 4-step list — order-type/collection
  // are never reachable (order.type/collectionType are locked at init
  // above), and 'approve' never applies since it is always exactly one
  // child, matching the personalise step's existing single-order behaviour
  // of auto-approving on Continue.
  const stepOrder = useMemo(() => (squadInviteContext ? SQUAD_INVITE_STEP_ORDER : stepsFor(order.type)), [order.type, squadInviteContext]);
  const activeIndex = stepOrder.indexOf(activeStepId);
  const summary = useMemo(() => summarizeOrder(order), [order]);
  // Authoritative pricing — server-only. paidPlayerCount/totalPrintQuantity
  // are the only two values sent (see useOrderPricingQuote/fetchPricingQuote);
  // tier, unit price, subtotal and coach-card eligibility all come back from
  // POST /api/pricing/quote and are never calculated here.
  const { state: quoteState, retry: retryQuote } = useOrderPricingQuote(summary.approvedPlayers.length, summary.approvedPrints);
  // Submit-ready only when the quote is 'ready' AND its counts match the
  // order's current approved players/prints exactly — a 'ready' quote left
  // over from before the last edit (a player added/removed/re-quantified
  // since) is stale, not authoritative for what's about to be submitted.
  // Every other state (idle, loading, error) is therefore also "not ready"
  // by construction, with no separate case needed for each.
  const currentQuote = quoteState.status === 'ready' ? quoteState.quote : null;
  const quoteMatchesCurrentCounts = isQuoteFreshForCounts(quoteState, summary.approvedPlayers.length, summary.approvedPrints);
  // Options come only from the order's own approved players — never an
  // arbitrary club/team outside this order. Recomputed whenever `order`
  // changes; reconciliation below invalidates a selection that no longer
  // appears here (a team removed) and auto-preselects the only remaining
  // option, independent of whether the coach card is currently eligible —
  // so the draft is already consistent by the time eligibility returns.
  const coachCardOptions = useMemo(() => coachCardTeamOptions(order), [order]);
  useEffect(() => {
    setCoachCardDraft((current) => reconcileCoachCardTeamSelection(current, coachCardOptions));
  }, [coachCardOptions]);
  // The only source of coach-card eligibility — never order.type, never a
  // hardcoded player-count threshold. See evaluateCoachCardEligibility.
  const coachCardEligibility = useMemo(
    () => evaluateCoachCardEligibility(quoteState, summary.approvedPlayers.length, summary.approvedPrints),
    [quoteState, summary.approvedPlayers.length, summary.approvedPrints],
  );
  const coachCardComplete = !coachCardEligibility.eligible || isCoachCardDraftComplete(coachCardDraft, coachCardOptions);
  const coachCardBlocksSubmission = coachCardEligibility.eligible && !coachCardComplete;
  const reviewGroups = useMemo(() => groupPlayersByClub(order, order.players), [order]);
  const approvedGroups = useMemo(() => groupPlayersByClub(order, summary.approvedPlayers), [order, summary.approvedPlayers]);
  const stats = sportConfig[order.sport].stats;
  const orderMode = orderModeLimits[order.type];
  const visibleOrderType = order.type === 'single' ? 'single' : 'squad';
  const addDisabled = !canAddPlayer(order);
  const hasAnyPhoto = order.players.some((player) => Boolean(player.photo?.srcUrl));
  const selectedHasPhoto = Boolean(selectedPlayer?.photo?.srcUrl);
  // summary.checkoutEligible already requires >=1 approved player, so the
  // zero-approved-players case is unaffected by quoteMatchesCurrentCounts —
  // it already short-circuits to false before that check is ever reached,
  // preserving the builder's existing zero-player submission rule exactly.
  const canSendEnquiry =
    summary.checkoutEligible &&
    enquiry.name.trim().length > 1 &&
    /\S+@\S+\.\S+/.test(enquiry.email) &&
    quoteMatchesCurrentCounts &&
    coachCardComplete;
  const quoteBlocksSubmission = summary.checkoutEligible && !quoteMatchesCurrentCounts;
  const canManageAsTeam = order.type !== 'single' || order.players.length > 1;
  const reviewPrimaryLabel = summary.checkoutEligible ? 'Continue to order' : summary.counts.ready > 0 ? 'Approve ready cards' : 'Continue';
  const reviewPrimaryDisabled = !summary.checkoutEligible && summary.counts.ready === 0;
  const reviewHelper = summary.checkoutEligible
    ? summary.counts.ready > 0 || summary.counts['needs-photo'] > 0 || summary.counts['needs-details'] > 0
      ? 'You can continue with approved cards now, or finish the remaining cards first.'
      : 'All approved cards are ready for the order summary.'
    : summary.counts.ready > 0
      ? 'Approve ready cards to unlock the order summary.'
      : 'Complete at least one card before continuing.';
  const canEditOrder = enquiryStatus !== 'sent';

  const patchOrder = (patch: Partial<OrderDraft>) => {
    setOrder((current) => ({ ...current, ...patch }));
  };

  const selectOrderClub = (clubId: string) => {
    const club = getEmjflClub(clubId);
    const preferredTemplate = preferredTemplateForClub(clubId) as TemplateId;
    setOrder((current) => ({
      ...current,
      collectionType: 'official',
      collectionName: EAST_MANCHESTER_LEAGUE,
      emjflClubId: club.id,
      club: club.name,
      league: EAST_MANCHESTER_LEAGUE,
      badgeUrl: undefined,
      templateDefault: preferredTemplate,
      players: current.players.map((player) => ({
        ...player,
        club: current.collectionType === 'custom' || !player.clubEdited ? club.name : player.club,
        emjflClubId: current.collectionType === 'custom' || !player.clubEdited ? club.id : player.emjflClubId,
        templateId: player.templateId && !isCustomCollectionTemplateId(player.templateId) ? player.templateId : preferredTemplate,
        updatedAt: nowIso(),
      })),
    }));
  };

  const selectCollection = (collectionType: OrderDraft['collectionType']) => {
    if (collectionType === 'official') {
      selectOrderClub(order.emjflClubId || DEFAULT_EMJFL_CLUB.id);
      return;
    }

    setOrder((current) => {
      const customClub = current.collectionType === 'custom' ? current.club : '';
      const customTemplate = isCustomCollectionTemplateId(current.templateDefault) ? current.templateDefault : DEFAULT_CUSTOM_TEMPLATE_ID;
      return {
        ...current,
        collectionType: 'custom',
        collectionName: 'Custom Collection',
        league: undefined,
        emjflClubId: undefined,
        club: customClub,
        templateDefault: customTemplate,
        players: current.players.map((player) => ({
          ...player,
          club: current.collectionType === 'custom' ? player.club || customClub : '',
          emjflClubId: undefined,
          badgeUrl: player.badgeUrl || current.badgeUrl,
          clubEdited: true,
          templateId: player.templateId && isCustomCollectionTemplateId(player.templateId) ? player.templateId : customTemplate,
          updatedAt: nowIso(),
        })),
      };
    });
  };

  const updateCustomClub = (club: string) => {
    setOrder((current) => ({
      ...current,
      club,
      players: current.players.map((player) => ({
        ...player,
        club: current.collectionType === 'custom'
          ? (player.id === selectedId || !player.clubEdited ? club : player.club)
          : (player.clubEdited ? player.club : club),
        updatedAt: nowIso(),
      })),
    }));
  };

  const selectPlayerClub = (playerId: string, clubId: string) => {
    const club = getEmjflClub(clubId);
    patchPlayer(playerId, {
      club: club.name,
      emjflClubId: club.id,
      clubEdited: true,
      badgeUrl: undefined,
      templateId: preferredTemplateForClub(club.id) as TemplateId,
    });
  };

  const patchPlayer = (id: string, patch: Partial<PlayerDraft>) => {
    setOrder((current) => ({
      ...current,
      players: current.players.map((player) => {
        if (player.id !== id) return player;
        if (player.approvedAt && !confirm('This card is approved. Editing it will require re-approval. Continue?')) {
          return player;
        }
        return { ...player, ...patch, updatedAt: nowIso() };
      }),
    }));
  };

  const addPlayer = (seed?: Partial<PlayerDraft>, options?: { step?: StepId; promoteSingle?: boolean }) => {
    const nextType: OrderType = options?.promoteSingle && order.type === 'single' ? 'set' : order.type;
    if (order.players.length >= orderModeLimits[nextType].maxPlayers) return;
    const player = createPlayer({
      stats: Object.fromEntries(stats.map((stat) => [stat.key, ''])),
      templateId: order.templateDefault,
      club: order.club,
      emjflClubId: order.emjflClubId,
      ...seed,
    });
    setOrder((current) => ({ ...current, type: nextType, players: [...current.players, player] }));
    setSelectedId(player.id);
    setActiveStepId(options?.step ?? 'upload');
  };

  const addPlayerToClub = (clubId: string, step: StepId = 'upload') => {
    const club = getEmjflClub(clubId);
    addPlayer({
      club: club.name,
      emjflClubId: club.id,
      clubEdited: true,
      templateId: preferredTemplateForClub(club.id) as TemplateId,
    }, { step, promoteSingle: true });
  };

  const addPlayerToCurrentTeam = (step: StepId = 'upload') => {
    if (order.collectionType === 'custom') {
      addPlayer({
        club: order.club,
        badgeUrl: order.badgeUrl,
        clubEdited: true,
        templateId: order.templateDefault,
      }, { step, promoteSingle: true });
      return;
    }
    addPlayerToClub(order.emjflClubId || DEFAULT_EMJFL_CLUB.id, step);
  };

  const addTeam = () => {
    if (order.collectionType === 'custom') {
      addPlayer({
        club: '',
        badgeUrl: undefined,
        clubEdited: true,
        templateId: order.templateDefault,
      }, { step: 'personalise', promoteSingle: true });
      return;
    }
    addPlayerToClub(nextClubId(order), 'upload');
  };

  const handleReviewPrimary = () => {
    if (summary.checkoutEligible) {
      setActiveStepId('review');
      return;
    }
    if (summary.counts.ready > 0) approveAllReady();
  };

  const handleBgRemovalContinue = () => {
    if (order.type !== 'single' && selectedIndex < order.players.length - 1) {
      selectAdjacentPlayer(1);
      return;
    }
    // The squad walk through bg-removal ends on the last player — hand off to
    // Personalise starting back at the first player, not mid/end of roster.
    if (order.type !== 'single' && order.players[0]) setSelectedId(order.players[0].id);
    setActiveStepId('personalise');
  };

  const removePlayer = (id: string) => {
    setOrder((current) => {
      const next = current.players.filter((player) => player.id !== id);
      if (selectedId === id) setSelectedId(next[0]?.id || '');
      return { ...current, players: next };
    });
  };

  const duplicatePlayer = (player: PlayerDraft) => {
    if (!canAddPlayer(order)) return;
    const copy = createPlayer({
      name: player.name ? `${player.name} copy` : '',
      club: player.club || order.club,
      badgeUrl: player.badgeUrl,
      emjflClubId: player.emjflClubId || order.emjflClubId,
      clubEdited: player.clubEdited,
      position: player.position,
      kitNo: '',
      stats: player.stats,
      templateId: player.templateId || order.templateDefault,
      prints: player.prints,
    });
    setOrder((current) => ({ ...current, players: [...current.players, copy] }));
    setSelectedId(copy.id);
  };

  const approvePlayer = (id: string) => {
    setOrder((current) => ({
      ...current,
      players: current.players.map((player) =>
        player.id === id && derivePlayerStatus(player) === 'ready'
          ? { ...player, approvedAt: nowIso(), updatedAt: nowIso() }
          : player,
      ),
    }));
  };

  const approveAllReady = () => {
    setOrder((current) => ({
      ...current,
      players: current.players.map((player) =>
        derivePlayerStatus(player) === 'ready' ? { ...player, approvedAt: nowIso(), updatedAt: nowIso() } : player,
      ),
    }));
  };

  const assignPhoto = (id: string, file?: File) => {
    if (!file) return;
    patchPlayer(id, {
      photo: {
        srcUrl: URL.createObjectURL(file),
        hiResUrl: URL.createObjectURL(file),
        crop: { x: 0, y: 0, scale: 1 },
        bgRemoved: false,
        fileName: file.name,
      },
    });
    setSelectedId(id);
    setActiveStepId('bg-removal');
  };

  const assignPlayerBadge = (id: string, file?: File) => {
    if (!file) return;
    patchPlayer(id, { badgeUrl: URL.createObjectURL(file), clubEdited: true });
  };

  const orderWithUploadedAssets = async (submissionId: string) => {
    const approvedIds = new Set(summary.approvedPlayers.map((player) => player.id));
    const uploaded = uploadedAssetsRef.current;

    const uploadOnce = (url: string, meta: { playerId: string; kind: 'photo' | 'badge'; fileName?: string }) => {
      const cacheKey = `${meta.kind}:${url}`;
      if (!uploaded.has(cacheKey)) {
        // Stage 6 — every asset this submission uploads is namespaced by
        // submissionKey, never order.id (a constant placeholder — see
        // defaultOrder() in emblem-uk-builder.ts), so the server can
        // verify every photoKey it receives genuinely belongs to this
        // one submission and reject anything that doesn't. submissionId is
        // passed in explicitly (never read from the outer submissionKey
        // state/closure here) so this always uses the exact value the
        // caller already resolved via ensureSubmissionKey(), never a
        // stale pre-resolution closure.
        const attempt = uploadOrderAsset(url, {
          orderId: submissionId,
          playerId: meta.playerId,
          kind: meta.kind,
          fileName: meta.fileName,
        }).catch((err) => {
          // A JS Promise is single-shot — once rejected, it stays rejected
          // forever, so caching a still-pending upload eagerly (as above)
          // would otherwise "cache" a transient failure permanently: a
          // retry would find this same rejected promise and re-throw the
          // exact same error without ever attempting the upload again.
          // Removing the entry on failure is what makes "retry only the
          // failed assets" actually true — a successful sibling upload's
          // cache entry is untouched, only this one clears so the next
          // call re-attempts it fresh.
          uploaded.delete(cacheKey);
          throw err;
        });
        uploaded.set(cacheKey, attempt);
      }
      return uploaded.get(cacheKey)!;
    };

    const players = await Promise.all(order.players.map(async (player) => {
      if (!approvedIds.has(player.id)) return player;

      let nextPlayer = { ...player };
      const photoUrl = player.photo?.hiResUrl || player.photo?.srcUrl;
      if (player.photo && photoUrl && isLocalAssetUrl(photoUrl)) {
        const asset = await uploadOnce(photoUrl, {
          playerId: player.id,
          kind: 'photo',
          fileName: player.photo.fileName,
        });
        nextPlayer = {
          ...nextPlayer,
          photo: {
            ...player.photo,
            srcUrl: asset.url,
            hiResUrl: asset.url,
            storageUrl: asset.url,
            storageKey: asset.key,
            contentType: asset.contentType,
            fileName: asset.fileName || player.photo.fileName,
            uploadedAt: nowIso(),
          },
        };
      }

      if (player.badgeUrl && isLocalAssetUrl(player.badgeUrl)) {
        const asset = await uploadOnce(player.badgeUrl, {
          playerId: player.id,
          kind: 'badge',
          fileName: `${playerClubName(order, player)} badge`,
        });
        nextPlayer = {
          ...nextPlayer,
          badgeUrl: asset.url,
          badgeStorageKey: asset.key,
        };
      }

      return nextPlayer;
    }));

    return { ...order, players };
  };

  const bulkPhotos = (files: FileList | null) => {
    const emptyPhotoSlots = order.players.filter((player) => !player.photo).length;
    const remainingSlots = orderMode.maxPlayers - order.players.length;
    const imageFiles = Array.from(files || [])
      .filter((file) => file.type.startsWith('image/'))
      .slice(0, Math.max(0, emptyPhotoSlots + remainingSlots));

    if (imageFiles.length === 0) return;

    const photoAssets = imageFiles.map((file) => ({
      srcUrl: URL.createObjectURL(file),
      hiResUrl: URL.createObjectURL(file),
      crop: { x: 0, y: 0, scale: 1 },
      bgRemoved: false,
      fileName: file.name,
    }));

    setOrder((current) => {
      const players = [...current.players];
      const maxPlayers = orderModeLimits[current.type].maxPlayers;
      let photoIndex = 0;

      for (let index = 0; index < players.length && photoIndex < photoAssets.length; index += 1) {
        if (!players[index].photo) {
          players[index] = { ...players[index], photo: photoAssets[photoIndex], updatedAt: nowIso() };
          photoIndex += 1;
        }
      }

      while (photoIndex < photoAssets.length && players.length < maxPlayers) {
        players.push(createPlayer({
          stats: Object.fromEntries(stats.map((stat) => [stat.key, ''])),
          templateId: current.templateDefault,
          club: current.club,
          emjflClubId: current.emjflClubId,
          photo: photoAssets[photoIndex],
        }));
        photoIndex += 1;
      }

      setSelectedId(players[players.length - 1]?.id || selectedId);
      setActiveStepId(current.type !== 'single' ? 'upload' : 'bg-removal');
      return { ...current, players };
      });
  };

  // Kept for a future internal/staff view — no longer exposed on the public
  // confirmation screen, but the download-a-JSON-summary capability itself
  // is intentionally retained rather than deleted. Not wired to the real
  // submit flow, so there is no confirmed-fresh quote to attach here —
  // passing null explicitly omits the pricing block rather than guessing.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const exportPayload = () => {
    const blob = new Blob([JSON.stringify({ contact: enquiry, ...productionPayload(order, null) }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `emblem-production-${order.id.slice(0, 8)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  /** Two paint frames — enough for the capture rig to mount and lay out. */
  const nextPaint = () =>
    new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

  /** Wait for every <img> under el to finish decoding (bounded, never throws). */
  const waitForImages = async (el: HTMLElement | null) => {
    if (!el) return;
    const imgs = Array.from(el.querySelectorAll('img'));
    await Promise.all(
      imgs.map((img) =>
        Promise.race([
          img.decode().catch(() => undefined),
          new Promise((r) => setTimeout(r, 4000)),
        ])
      )
    );
  };

  /**
   * Guardian-controlled card-front sharing (Work Package B, draft). Renders
   * the SAME PlayerCard component the review screen and print pipeline
   * already use — unmodified — off-screen, captures it with the same
   * captureElementToPng print-capture.ts already exports (also unmodified),
   * at a lower pixelRatio than print, and returns a data URL. Nothing here
   * ever calls renderPrintFile, so no bleed/crop marks or print-only
   * artwork are ever produced. The caller (ShareCardSheet, via card-share.ts)
   * is responsible for having already recorded consent before calling this
   * — this function only ever renders the front the player/guardian already
   * approved, exactly as it appears on screen.
   *
   * Fixes a live-preview-verified defect: the shared image reproduced the
   * card design and badge but not the player's photograph. Root cause,
   * proven by reading the code rather than guessed at: by the time "Order
   * received" (and therefore the share button) exists at all,
   * orderWithUploadedAssets has already replaced this player's photo.
   * srcUrl — and any player-uploaded badge — with a remote, signed URL.
   * That URL displays perfectly well in an ordinary <img> (no CORS needed
   * for that), but html2canvas cannot draw a cross-origin image onto
   * canvas without the host's cooperation, so that layer alone silently
   * disappeared from the captured output. Fetching each such URL here and
   * substituting a fresh local blob: URL before ever rendering the capture
   * rig removes the cross-origin request from the drawing step entirely —
   * and if that fetch itself fails (e.g. genuinely no CORS grant to read
   * the bytes), it throws here, which the caller already turns into a
   * visible, retryable failure — never a silently incomplete image.
   */
  const fetchAsLocalImageUrl = async (url: string): Promise<{ url: string; revoke: () => void }> => {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Could not load an image required for this card');
    const blob = await response.blob();
    const localUrl = URL.createObjectURL(blob);
    return { url: localUrl, revoke: () => URL.revokeObjectURL(localUrl) };
  };

  /** Same-origin, bundled template assets (e.g. the Custom Collection
   *  placeholder badge) are referenced as root-relative paths — never
   *  remote, never in need of localising. */
  const needsLocalizing = (url?: string | null): url is string =>
    Boolean(url) && !isLocalAssetUrl(url!) && !url!.startsWith('/');

  const captureShareImage = async (): Promise<string> => {
    const approvedPlayer = summary.approvedPlayers[0];
    if (!approvedPlayer) throw new Error('Could not prepare card image');

    const revokers: Array<() => void> = [];
    try {
      let capturePlayer = approvedPlayer;

      const photoUrl = capturePlayer.photo?.srcUrl;
      if (needsLocalizing(photoUrl)) {
        const local = await fetchAsLocalImageUrl(photoUrl);
        revokers.push(local.revoke);
        capturePlayer = { ...capturePlayer, photo: { ...capturePlayer.photo!, srcUrl: local.url } };
      }

      const badgeUrl = capturePlayer.badgeUrl;
      if (needsLocalizing(badgeUrl)) {
        const local = await fetchAsLocalImageUrl(badgeUrl);
        revokers.push(local.revoke);
        capturePlayer = { ...capturePlayer, badgeUrl: local.url };
      }

      setShareCapturePlayer(capturePlayer);
      try {
        await nextPaint();
        const el = shareCaptureRef.current;
        if (!el) throw new Error('Could not prepare card image');
        await waitForImages(el);

        // Deterministic capture-ready gate: waitForImages resolving is not
        // itself proof every image actually rendered — decode() can settle
        // for a source that failed to resolve to real pixels. Every <img>
        // this off-screen rig renders must have genuine dimensions before
        // capture proceeds; this is what makes the gate real rather than a
        // hopeful wait, and is exactly the check that would have caught
        // the reported defect instead of silently producing an incomplete
        // image.
        const imgs = Array.from(el.querySelectorAll('img'));
        if (imgs.some((img) => img.naturalWidth === 0 || img.naturalHeight === 0)) {
          throw new Error('Could not prepare the card image for sharing');
        }

        return await captureElementToPng(el, { pixelRatio: 2, backgroundColor: '#ffffff' });
      } finally {
        setShareCapturePlayer(null);
      }
    } finally {
      for (const revoke of revokers) revoke();
    }
  };

  const submitEnquiry = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Explicit synchronous guard via a ref, not enquiryStatus state — two
    // clicks fired on the same tick both run this function before React
    // has processed the first setEnquiryStatus('sending') and re-rendered
    // with an updated closure, so a check against the *state* value is a
    // stale-closure race (a plain `if (enquiryStatus === 'sending')
    // return;` here let both clicks through in testing). A ref mutates
    // synchronously and is shared across both invocations. submissionKey
    // stays the same either way, so even if this were somehow bypassed,
    // the server's idempotency check on it still prevents a duplicate
    // order — this guard is what keeps a double-click from ever sending a
    // second request in the first place.
    if (submittingRef.current) return;
    if (!canSendEnquiry) return;
    // A conflict means this submissionKey is already bound, server-side,
    // to different content than what's currently in the form — retrying
    // the identical (still-changed) request would only repeat the same
    // conflict. Recovery requires the explicit "Start a new order" action
    // below, never an ordinary resubmit.
    if (enquiryConflict) return;
    submittingRef.current = true;
    // canSendEnquiry already guarantees quoteMatchesCurrentCounts, so
    // currentQuote is confirmed non-null and fresh for exactly this
    // submission — captured once here rather than re-read later, so the
    // payload always reflects the quote that authorized this submit.
    const quoteForSubmission = currentQuote;
    // canSendEnquiry also already guarantees coachCardComplete (either the
    // coach card is not eligible at all, or it is eligible AND complete) —
    // captured once here for the same reason as quoteForSubmission above.
    const coachCardEligibleForSubmission = coachCardEligibility.eligible;
    const coachCardDraftForSubmission = coachCardDraft;
    const coachCardOptionsForSubmission = coachCardOptions;
    setEnquiryStatus('sending');
    setEnquiryError('');

    try {
      // Resolved once per submit, then used as a plain local value for the
      // rest of this function — never the outer submissionKey state/
      // closure, which could still be '' if this fires unusually early
      // (issuance is kicked off on mount, well before a real customer
      // could realistically reach this button, but this makes the
      // function correct regardless of timing rather than reliant on it).
      const submissionKey = await ensureSubmissionKey();

      // One order reference, generated once, reused everywhere: the print
      // PDF metadata, the orders row, and the Shopify cart attribute the
      // paid-webhook later matches on (Checkout Phase 0 defect #1). Derived
      // from submissionKey (a real random UUID), not order.id (a constant
      // placeholder) — recomputing this on a retry is harmless, since the
      // server only uses the client-supplied orderRef for a brand-new
      // order; a retry of an already-created submissionKey returns the
      // original order's own stored order_ref instead.
      const orderRef = `emblem-${submissionKey.slice(0, 8)}-${Date.now().toString(36)}`;

      // 1) Capture print files while photos are still local blob URLs —
      //    after orderWithUploadedAssets() swaps them to S3 URLs, canvas
      //    capture would need bucket CORS config to avoid tainting.
      setCaptureMode(true);
      await nextPaint();
      const rig = captureRefs.current;
      for (const el of Array.from(rig.values())) await waitForImages(el);

      // Cached by player.id, invalidated only when that player's
      // approvedAt changes (a genuine re-approval after an edit) — an
      // unedited approved card is re-rendered and re-uploaded at most once
      // per submissionKey, not on every retry. isPlayerDirty()/
      // derivePlayerStatus() already guarantee a dirty player can't be in
      // summary.approvedPlayers in the first place, so approvedAt alone is
      // a safe, sufficient cache-invalidation key here.
      const printFileCache = printFilesRef.current;
      const printFiles: Array<{ playerId: string; playerName: string; key: string }> = [];
      for (const player of summary.approvedPlayers) {
        const cached = printFileCache.get(player.id);
        if (cached && cached.approvedAt === player.approvedAt) {
          printFiles.push(cached.result);
          continue;
        }
        const frontEl = rig.get(`${player.id}:front`);
        const backEl = rig.get(`${player.id}:back`);
        if (!frontEl) continue;
        const front = await captureElementToPng(frontEl, { pixelRatio: 3, backgroundColor: '#ffffff' });
        const back = backEl
          ? await captureElementToPng(backEl, { pixelRatio: 3, backgroundColor: '#ffffff' })
          : undefined;
        const rendered = await renderPrintFile(
          'card',
          front,
          {
            playerName: player.name || 'Player',
            teamName: playerClubName(order, player) || undefined,
            template: selectedTemplate(order, player).name,
            orderRef,
          },
          back,
          submissionKey
        );
        const result = { playerId: player.id, playerName: player.name || 'Player', key: rendered.key };
        printFileCache.set(player.id, { approvedAt: player.approvedAt, result });
        printFiles.push(result);
      }
      setCaptureMode(false);

      // 2) Upload source assets (photos/badges) to S3.
      const productionOrder = await orderWithUploadedAssets(submissionKey);

      // 2b) Coach-card photo, uploaded through the exact same order-assets
      //     pipeline as player photos — this is just an S3 key segment (see
      //     /api/order-assets/route.ts's cleanSegment()), not a real
      //     player/DB row. Only runs for a fresh eligible+complete coach
      //     card with a local (blob:) photo still to upload. Namespaced
      //     under submissionKey exactly like player photos.
      //
      //     coach-${photo.id} — photo.id is a stable identity generated
      //     once when the customer selects this file (CoachCardSection.tsx)
      //     and never regenerated on retry, and this upload goes through
      //     the SAME persistent uploadedAssetsRef cache as player photos —
      //     an unchanged coach photo uploads at most once per
      //     submissionKey and reuses the exact same key on every retry. A
      //     genuine replace gets a genuinely new photo.id (and a new blob
      //     URL), so it naturally gets a new cache entry / new S3 key —
      //     never colliding with the previous (now-orphaned) attempt's.
      let coachCardBlock: ReturnType<typeof buildCoachCardPayload> = null;
      if (coachCardEligibleForSubmission && coachCardDraftForSubmission.photo) {
        const photoUrl = coachCardDraftForSubmission.photo.srcUrl;
        const coachAssetId = `coach-${coachCardDraftForSubmission.photo.id}`;
        const coachCacheKey = `photo:${photoUrl}`;
        const coachUploadedAssets = uploadedAssetsRef.current;
        if (!coachUploadedAssets.has(coachCacheKey)) {
          // Same not-cached-while-pending/rejected fix as uploadOnce above —
          // a failed coach upload must be retryable, not permanently poisoned.
          const attempt = uploadOrderAsset(photoUrl, { orderId: submissionKey, playerId: coachAssetId, kind: 'photo', fileName: coachCardDraftForSubmission.photo.fileName }).catch((err) => {
            coachUploadedAssets.delete(coachCacheKey);
            throw err;
          });
          coachUploadedAssets.set(coachCacheKey, attempt);
        }
        const photoKey = isLocalAssetUrl(photoUrl) ? (await coachUploadedAssets.get(coachCacheKey)!).key : null;
        coachCardBlock = buildCoachCardPayload(coachCardDraftForSubmission, coachCardOptionsForSubmission, photoKey);
      }

      // 3) One atomic call — the server derives authoritative pricing from
      //    the players below itself (never trusting the `pricing` block
      //    productionPayload() still attaches for freshness comparison
      //    only), validates the coach card against that authoritative
      //    result, and persists everything (order, pricing snapshot, line
      //    items, players, cards, card_definitions, and the coach-card
      //    record when eligible) in one transaction — see
      //    supabase/migrations/0048_authoritative_order_persistence.sql
      //    and src/app/api/order-enquiry/route.ts. coachCard stays a
      //    separate, clearly-labelled block, never merged into players.
      const response = await fetch('/api/order-enquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [BUILDER_CSRF_HEADER]: readBuilderCsrfCookie() },
        body: JSON.stringify({
          contact: enquiry,
          submittedAt: nowIso(),
          submissionKey,
          orderRef,
          printFiles,
          ...productionPayload(productionOrder, quoteForSubmission),
          ...(coachCardBlock ? { coachCard: coachCardBlock } : {}),
        }),
      });

      const result = await response.json().catch(() => null);
      if (response.status === 409) {
        // Same submissionKey, materially different content than whatever
        // the server already committed under it — never treat this as a
        // plain retryable failure (see the enquiryConflict guard above).
        setEnquiryConflict(true);
        throw new Error(result?.error || 'This submission was already sent with different details');
      }
      if (!response.ok || !result?.ok || !result?.orderId) {
        throw new Error(result?.error || 'Could not send enquiry');
      }

      setOrder(productionOrder);
      setEnquiryStatus('sent');
      setSubmittedOrderId(result.orderId);
      setSubmittedAuthorityStatus(typeof result.authorityStatus === 'string' ? result.authorityStatus : null);

      // 4) Hand off to Shopify checkout when the UK card variant is
      //    configured. The paid-webhook flips this order to 'paid' when
      //    payment completes. Without the env var we stay on the manual
      //    "we'll email a payment link" flow — same behaviour as before.
      const cartUrl = buildUkCardCartUrl(summary.approvedPrints, orderRef);
      if (cartUrl) {
        window.location.href = cartUrl;
      }
    } catch (error) {
      setCaptureMode(false);
      setEnquiryStatus('error');
      setEnquiryError(error instanceof Error ? error.message : 'Could not send enquiry');
      // Release the guard so a retry (same submissionKey, same builder
      // state — nothing here is cleared) can actually submit again.
      submittingRef.current = false;
    }
  };

  // The only place submissionKey is ever regenerated — an explicit,
  // visible customer action (never automatic) for recovering from a
  // genuine 409 conflict. Clears the asset caches too: they're keyed by
  // blob URL, which hasn't changed, so without this a "new" submission
  // would still resolve to the old (now-conflicting) S3 keys.
  const startNewOrder = () => {
    // The old capability is deliberately left to expire/hit its ceiling
    // naturally rather than explicitly revoked from the client — there is
    // no legitimate client-authenticated way to prove which capability to
    // revoke that isn't itself just the cookie the server already trusts,
    // and doing it server-side here would need a dedicated endpoint for a
    // rare, low-severity edge case (a customer abandoning one order for
    // another in the same session).
    submissionCapabilityRef.current = null;
    ensureSubmissionKey().catch(() => {});
    uploadedAssetsRef.current.clear();
    printFilesRef.current.clear();
    submittingRef.current = false;
    setEnquiryConflict(false);
    setEnquiryStatus('idle');
    setEnquiryError('');
  };

  // Squad Invite's own submit path — entirely separate from submitEnquiry
  // above (which stays untouched: no shared state, no shared guard ref).
  // Reuses the same uploadOrderAsset() helper the normal flow uses for
  // photos, then posts to the authenticated Squad Invite commit route
  // instead of /api/order-enquiry. No pricing quote, no Shopify handoff, no
  // contact form — payment is shown as disabled, never collected.
  const submitSquadInviteCommitment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!squadInviteContext) return;
    // Ref guard, not just squadInviteSubmitting state — same same-tick
    // double-invocation race this file already documents at submittingRef
    // above.
    if (squadInviteSubmittingRef.current) return;
    const player = order.players[0];
    const nameParts = player.name.trim().split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] || '';
    const surnameInitial = (nameParts.length > 1 ? nameParts[nameParts.length - 1] : firstName).charAt(0).toUpperCase();
    // Declarations are validated separately from name/photo completeness so
    // a missing declaration can focus the first invalid row specifically,
    // rather than a single generic message covering two unrelated causes.
    const missingDeclarations = SQUAD_INVITE_REQUIRED_DECLARATIONS.filter((declaration) => !squadInviteAccepted[declaration.purpose]);
    if (missingDeclarations.length > 0) {
      setSquadInviteDeclarationErrors(Object.fromEntries(missingDeclarations.map((declaration) => [declaration.purpose, true])));
      setSquadInviteOutcome('validation');
      squadInviteDeclarationRefs.current[missingDeclarations[0].purpose]?.focus();
      return;
    }
    setSquadInviteDeclarationErrors({});
    if (!firstName || !surnameInitial || !player.photo?.srcUrl) {
      setSquadInviteOutcome('validation');
      return;
    }
    squadInviteSubmittingRef.current = true;
    setSquadInviteSubmitting(true);
    setSquadInviteOutcome(null);
    let succeeded = false;
    try {
      let photo = player.photo;
      if (photo && isLocalAssetUrl(photo.srcUrl)) {
        // Upload is validated and reported on its own — a non-ok response
        // from the server (storage misconfigured, upload rejected) must
        // never be labelled a "network problem", and must never reach the
        // commit fetch below. Nothing here mutates order/player/declaration
        // state, so a failed attempt leaves the photo, personalise fields
        // and declarations exactly as entered for the parent to retry.
        try {
          const asset = await uploadOrderAsset(photo.hiResUrl || photo.srcUrl, {
            orderId: squadInviteContext.participationId,
            playerId: 'child',
            kind: 'photo',
            fileName: photo.fileName,
          });
          photo = {
            ...photo,
            srcUrl: asset.url,
            hiResUrl: asset.url,
            storageUrl: asset.url,
            storageKey: asset.key,
            contentType: asset.contentType,
            fileName: asset.fileName || photo.fileName,
          };
        } catch (uploadError) {
          setSquadInviteOutcome(uploadError instanceof OrderAssetUploadHttpError ? 'photo_upload_failed' : 'network');
          return;
        }
      }
      // The commit request itself: a genuine fetch() rejection (no
      // connectivity, DNS/CORS) is caught here and reported as a network
      // problem — a real HTTP response, even a rejecting one, is handled
      // by the explicit status checks below instead, never through catch.
      let response: Response;
      try {
        response = await fetch(`/api/squad-invite-participations/${encodeURIComponent(squadInviteContext.participationId)}/commit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Emblem-CSRF': readSquadInviteCsrfCookie() },
          body: JSON.stringify({
            templateId: selectedTemplate(order, player).id,
            displayFirstName: firstName,
            displaySurnameInitial: surnameInitial,
            squadNumber: /^[0-9]+$/.test(player.kitNo.trim()) ? Number(player.kitNo.trim()) : null,
            position: player.position,
            printQuantity: player.prints,
            photo: photo && {
              storageKey: photo.storageKey,
              storageUrl: photo.storageUrl,
              contentType: photo.contentType,
              fileName: photo.fileName,
              crop: photo.crop,
              bgRemoved: photo.bgRemoved,
            },
            stats: player.stats,
            accepted: Object.fromEntries(SQUAD_INVITE_REQUIRED_DECLARATIONS.map((declaration) => [declaration.purpose, Boolean(squadInviteAccepted[declaration.purpose])])),
          }),
        });
      } catch {
        setSquadInviteOutcome('network');
        return;
      }
      if (response.status === 401) { setSquadInviteOutcome('sign_in_required'); return; }
      if (response.status === 400) { setSquadInviteOutcome('validation'); return; }
      if (!response.ok) {
        // The one rejection reason worth telling apart from every other
        // generic ineligibility case — "try again shortly" is wrong once
        // the organiser has closed the campaign (see commit/route.ts).
        const body = await response.json().catch(() => null) as { reason?: string } | null;
        setSquadInviteOutcome(body?.reason === 'campaign_closed' ? 'campaign_closed' : 'unavailable');
        return;
      }
      setSquadInvitePhase('success');
      succeeded = true;
      // submittingRef intentionally stays true on success — one-shot
      // commitment, matching the server's own one-shot semantics (a repeat
      // attempt is idempotent server-side, but the UI never offers one).
    } finally {
      setSquadInviteSubmitting(false);
      if (!succeeded) squadInviteSubmittingRef.current = false;
    }
  };

  const progress = ((activeIndex + 1) / stepOrder.length) * 100;
  const progressLabel = activeStepId === 'approve' || activeStepId === 'review'
    ? `${order.players.length} player${order.players.length === 1 ? '' : 's'} - ${summary.counts.approved} approved`
    : STEP_LABEL[activeStepId];
  const goBack = () => {
    const previous = stepOrder[Math.max(0, activeIndex - 1)];
    setActiveStepId(previous);
  };
  // The review form's actual onSubmit — submitEnquiry itself is untouched
  // and never called directly from JSX any more. The first time this fires
  // per order it only advances to the Adult Permission step (migration
  // 0071); every existing field, quote and coach-card state on the review
  // screen is left exactly as-is (no state is cleared here), so returning
  // to Review after the permission step — or if verification is
  // interrupted — shows the same order the customer already built.
  // adultPermissionConfirmed only ever becomes true immediately before the
  // one place that calls submitEnquiry directly (AdultPermissionStep's
  // onConfirmed below), so this branch existing at all is just defence —
  // in practice this handler runs the real submission exactly once.
  const handleReviewFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (!adultPermissionConfirmed) {
      event.preventDefault();
      setActiveStepId('adult-permission');
      return;
    }
    submitEnquiry(event);
  };
  const approveOrReviewStep: StepId = stepOrder.includes('approve') ? 'approve' : 'review';
  const prePersonaliseSteps: StepId[] = ['order-type', 'collection', 'upload', 'bg-removal'];
  const selectedIndex = selectedPlayer ? order.players.findIndex((player) => player.id === selectedPlayer.id) : -1;
  const selectAdjacentPlayer = (direction: -1 | 1) => {
    if (selectedIndex < 0) return;
    const nextPlayer = order.players[selectedIndex + direction];
    if (nextPlayer) setSelectedId(nextPlayer.id);
  };
  const chooseTemplate = (templateId: TemplateId) => {
    patchOrder({ templateDefault: templateId });
    if (selectedPlayer) patchPlayer(selectedPlayer.id, { templateId });
  };
  const styleRailRef = useRef<HTMLDivElement>(null);
  const scrollStyleRail = (direction: -1 | 1) => {
    styleRailRef.current?.scrollBy({ left: direction * 140, behavior: 'smooth' });
  };
  const orderedTemplates = useMemo(() => {
    const collectionTemplates = templates.filter((template) =>
      order.collectionType === 'custom'
        ? isCustomCollectionTemplateId(template.id)
        : !isCustomCollectionTemplateId(template.id),
    );
    if (order.collectionType === 'custom') return collectionTemplates;
    const preferred = preferredTemplateForClub(playerClubId(order, selectedPlayer));
    return [...collectionTemplates].sort((a, b) => {
      if (a.id === preferred) return -1;
      if (b.id === preferred) return 1;
      return 0;
    });
  }, [order, selectedPlayer]);

  return (
    <div className="uk-builder-shell uk-wizard-shell">
      {captureMode && (
        <div aria-hidden style={{ position: 'fixed', left: -10000, top: 0, pointerEvents: 'none' }}>
          {summary.approvedPlayers.map((player) => (
            <div key={player.id}>
              <div
                ref={(el) => { if (el) captureRefs.current.set(`${player.id}:front`, el); }}
                style={{ width: 340 }}
              >
                <PlayerCard order={order} player={player} side="front" forPrint />
              </div>
              <div
                ref={(el) => { if (el) captureRefs.current.set(`${player.id}:back`, el); }}
                style={{ width: 340 }}
              >
                <PlayerCard order={order} player={player} side="back" forPrint />
              </div>
            </div>
          ))}
        </div>
      )}
      {shareCapturePlayer && (
        <div aria-hidden style={{ position: 'fixed', left: -10000, top: 0, pointerEvents: 'none' }}>
          <div ref={shareCaptureRef} style={{ width: 340 }}>
            <PlayerCard order={order} player={shareCapturePlayer} side="front" />
          </div>
        </div>
      )}
      <div className={`uk-wizard-phone${activeStepId === 'review' && squadInviteContext ? ' uk-wizard-phone--squad-review' : ''}`}>
        <header className="uk-wizard-header">
          <div className="uk-wizard-topbar">
            <button type="button" className="uk-icon-button" onClick={goBack} aria-label="Back" disabled={activeIndex === 0}>
              &lsaquo;
            </button>
            <Link href="/" className="uk-wizard-brand" aria-label="Emblem home">
              <img src="/builder-emblem-logo.png" alt="Emblem" />
            </Link>
            <button
              type="button"
              className="uk-progress-pill"
              aria-label={progressLabel}
              onClick={() => setActiveStepId(summary.checkoutEligible ? 'review' : approveOrReviewStep)}
              disabled={prePersonaliseSteps.includes(activeStepId) && !summary.checkoutEligible}
            >
              {progressLabel}
            </button>
          </div>
          <div className="uk-wizard-progress">
            <div><span style={{ width: `${progress}%` }} /></div>
            <b>{String(activeIndex + 1).padStart(2, '0')} / {String(stepOrder.length).padStart(2, '0')} &middot; {STEP_LABEL[activeStepId]}</b>
          </div>
        </header>

        <main className="uk-wizard-screen">
          {activeStepId === 'order-type' && (
            <section className="uk-wizard-panel">
              <p className="uk-wizard-kicker">Start order</p>
              <h1>Who are you building for?</h1>
              <p className="uk-wizard-copy">Are you creating one card, or a whole team?</p>
              <div className="uk-wizard-choice-list" role="radiogroup" aria-label="Who are you building for?">
                {orderTypes.map((type) => (
                  <button
                    key={type.id}
                    type="button"
                    className={visibleOrderType === type.id ? 'active' : ''}
                    role="radio"
                    aria-checked={visibleOrderType === type.id}
                    onClick={() => patchOrder({ type: type.id })}
                  >
                    <span className="uk-choice-icon" aria-hidden="true">
                      {type.icon === 'person' ? (
                        <svg viewBox="0 0 24 24" role="img">
                          <circle cx="12" cy="8" r="3.5" />
                          <path d="M5.8 20c0-4 2.7-7 6.2-7s6.2 3 6.2 7" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" role="img">
                          <circle cx="9" cy="8.5" r="3" />
                          <circle cx="16.5" cy="9.5" r="2.5" />
                          <path d="M3.8 20c0-3.8 2.3-6.3 5.2-6.3s5.2 2.5 5.2 6.3" />
                          <path d="M13.8 15c2.8.2 4.7 2.3 4.7 5" />
                        </svg>
                      )}
                    </span>
                    <span>
                      <strong>{type.title}</strong>
                      <small>{type.copy}</small>
                    </span>
                    <span className="uk-choice-radio" aria-hidden="true" />
                  </button>
                ))}
                {squadInviteEnabled && (
                  <a
                    href="/squad-invite/start"
                    className="uk-wizard-choice-invite"
                    role="radio"
                    aria-checked="false"
                    onKeyDown={(event) => {
                      if (event.key === ' ' || event.key === 'Spacebar') {
                        event.preventDefault();
                        window.location.assign('/squad-invite/start');
                      }
                    }}
                  >
                    <span className="uk-choice-icon" aria-hidden="true">
                      {/* eslint-disable-next-line @next/next/no-img-element -- a
                          fixed 38px decorative icon inside a small circular
                          badge; next/image's overhead (loader, layout shift
                          reservation) isn't warranted here, matching how this
                          same badge already renders hand-drawn SVGs for the
                          other two options via a plain element, not <Image>. */}
                      <img src="/invite-squad-icon.png" alt="" />
                    </span>
                    <span>
                      <em className="uk-choice-badge">Best for clubs</em>
                      <strong>Invite your squad</strong>
                      <small>Share a private link so each parent creates their child&apos;s card.</small>
                    </span>
                    <span className="uk-choice-radio" aria-hidden="true" />
                  </a>
                )}
              </div>
              {squadInviteEnabled && (
                <div className="uk-choice-reassurance">
                  <svg viewBox="0 0 24 24" role="img" aria-hidden="true">
                    <path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-3z" />
                    <path d="M9 12l2 2 4-4" />
                  </svg>
                  <span>Parents only see their own child&apos;s details.</span>
                </div>
              )}
              <button type="button" className="uk-wizard-primary" onClick={() => setActiveStepId('collection')}>Continue</button>
            </section>
          )}

          {activeStepId === 'collection' && (
            <section className="uk-wizard-panel">
              <p className="uk-wizard-kicker">Start order</p>
              <h1>Choose your collection.</h1>
              <p className="uk-wizard-copy">Pick the collection this card belongs to.</p>
              <div className="uk-collection-choice">
                <div className="uk-collection-options">
                  {collections.map((collection) => (
                    <button
                      key={collection.id}
                      type="button"
                      className={order.collectionType === collection.id ? 'active' : ''}
                      onClick={() => selectCollection(collection.id)}
                    >
                      <span>
                        <strong>{collection.title}</strong>
                        <em>{collection.proof}</em>
                      </span>
                      <ul>
                        {collection.points.map((point) => <li key={point}>{point}</li>)}
                      </ul>
                    </button>
                  ))}
                </div>
              </div>
              <button type="button" className="uk-wizard-primary" onClick={() => setActiveStepId('upload')}>Continue</button>
            </section>
          )}

          {activeStepId === 'upload' && (
            <section className="uk-wizard-panel">
              <p className="uk-wizard-kicker">Upload photos</p>
              <h1>{order.type !== 'single' ? 'Upload your squad.' : 'Start with a photo.'}</h1>
              <p className="uk-wizard-copy">
                {order.type !== 'single' ? 'Drop in every player photo together, then complete each card in the queue.' : 'Pick the football photo you want to turn into a card.'}
              </p>
              {order.type === 'single' && selectedPlayer && !selectedHasPhoto && (
                <div className="uk-photo-carousel single">
                  <label className="uk-upload-card active">
                    <span aria-hidden="true">+</span>
                    <strong>Upload photo</strong>
                    <small>Pick one football photo from your files.</small>
                    <input type="file" accept="image/*" hidden onChange={(event) => assignPhoto(selectedPlayer.id, event.target.files?.[0])} />
                  </label>
                </div>
              )}

              {order.type === 'single' && selectedPlayer && selectedHasPhoto && (
                <div className="uk-single-upload-summary">
                  <span className="uk-player-strip-photo">
                    <img src={selectedPlayer.photo?.srcUrl} alt="" />
                  </span>
                  <div>
                    <small>Photo added</small>
                    <strong>{playerLabel(selectedPlayer)}</strong>
                    <span>{selectedPlayer.photo?.fileName || 'Ready to customise'}</span>
                  </div>
                  <label>
                    Replace photo
                    <input type="file" accept="image/*" hidden onChange={(event) => assignPhoto(selectedPlayer.id, event.target.files?.[0])} />
                  </label>
                </div>
              )}

              {order.type !== 'single' && !hasAnyPhoto && (
                <div className="uk-photo-carousel team">
                  <label className="uk-upload-card active">
                    <span aria-hidden="true">+</span>
                    <strong>Upload player photos</strong>
                    <small>Select one photo, or choose several at once.</small>
                    <input type="file" accept="image/*" multiple hidden onChange={(event) => bulkPhotos(event.target.files)} />
                  </label>
                  <button type="button" className="uk-upload-card" onClick={() => addPlayer()} disabled={addDisabled}>
                    <span aria-hidden="true">+</span>
                    <strong>Add manually</strong>
                    <small>Create a player row before adding their photo.</small>
                  </button>
                </div>
              )}

              {order.type !== 'single' && hasAnyPhoto && selectedPlayer && (
                <div className="uk-collapsed-upload-actions">
                  <label>
                    Add photos
                    <input type="file" accept="image/*" multiple hidden onChange={(event) => bulkPhotos(event.target.files)} />
                  </label>
                  <label>
                    Replace selected photo
                    <input type="file" accept="image/*" hidden onChange={(event) => assignPhoto(selectedPlayer.id, event.target.files?.[0])} />
                  </label>
                </div>
              )}
              {false && (
              <div className="uk-photo-carousel">
                {selectedPlayer && (
                  <label className="uk-upload-card active">
                    <span aria-hidden="true">+</span>
                    <strong>{selectedPlayer.photo ? 'Replace photo' : 'Upload a photo'}</strong>
                    <small>{selectedPlayer.photo?.fileName || 'Pick one from your files.'}</small>
                    <input type="file" accept="image/*" hidden onChange={(event) => assignPhoto(selectedPlayer.id, event.target.files?.[0])} />
                  </label>
                )}
                <label className="uk-upload-card">
                  <span aria-hidden="true">+</span>
                  <strong>{order.type === 'single' ? 'Use another photo' : 'Bulk upload'}</strong>
                  <small>{order.type === 'single' ? 'Replace the selected player photo.' : 'Create cards from several player photos.'}</small>
                  <input type="file" accept="image/*" multiple hidden onChange={(event) => bulkPhotos(event.target.files)} />
                </label>
              </div>
              )}
              {order.type !== 'single' && (hasAnyPhoto || order.players.length > 1) ? (
                <SquadUploadQueue
                  order={order}
                  selectedId={selectedId}
                  summary={summary}
                  canAdd={!addDisabled}
                  onSelect={setSelectedId}
                  onPatch={patchPlayer}
                  onPhoto={assignPhoto}
                  onRemove={removePlayer}
                  onDuplicate={duplicatePlayer}
                  onAdd={() => addPlayer()}
                />
              ) : order.type === 'single' ? (
                <PlayerStrip order={order} selectedId={selectedId} onSelect={setSelectedId} />
              ) : null}
              <div className="uk-wizard-row-actions">
                {order.type !== 'single' && <button type="button" onClick={() => addPlayer()} disabled={addDisabled}>Add player</button>}
                <button
                  type="button"
                  className="uk-wizard-primary compact"
                  onClick={() => {
                    // Bulk upload leaves selectedId on the last player added; walk
                    // the squad through bg-removal in roster order, so start over
                    // from the first player with a photo rather than the last.
                    const firstWithPhoto = order.players.find((player) => player.photo?.srcUrl);
                    if (order.type !== 'single' && firstWithPhoto) setSelectedId(firstWithPhoto.id);
                    setActiveStepId('bg-removal');
                  }}
                  disabled={!hasAnyPhoto}
                >
                  Continue
                </button>
              </div>
            </section>
          )}

          {activeStepId === 'bg-removal' && selectedPlayer && (
            <BackgroundRemovalStep
              player={selectedPlayer}
              isSquad={order.type !== 'single'}
              playerIndex={Math.max(0, selectedIndex)}
              playerCount={order.players.length}
              canPrev={selectedIndex > 0}
              canNext={selectedIndex < order.players.length - 1}
              onPrev={() => selectAdjacentPlayer(-1)}
              onNext={() => selectAdjacentPlayer(1)}
              onPatchPlayer={patchPlayer}
              onContinue={handleBgRemovalContinue}
            />
          )}

          {activeStepId === 'personalise' && (
            <section className="uk-wizard-panel">
              <p className="uk-wizard-kicker">Personalise cards</p>
              <h1>Make it yours.</h1>
              <p className="uk-wizard-copy">Choose the look, edit the details and approve each card when it is ready.</p>
              <div className="uk-wizard-fields">
                {order.collectionType === 'official' ? (
                  <>
                    <label>
                      Season
                      <input value={order.season} onChange={(event) => patchOrder({ season: event.target.value })} />
                    </label>
                    <label>
                      Collection
                      <input value={order.league || EAST_MANCHESTER_LEAGUE} readOnly />
                    </label>
                    <div className="uk-wizard-club-row">
                      <label>
                        Club
                        <select
                          value={order.emjflClubId || DEFAULT_EMJFL_CLUB.id}
                          onChange={(event) => selectOrderClub(event.target.value)}
                        >
                          {EMJFL_CLUBS.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
                        </select>
                      </label>
                      <img src={playerBadge(order)} alt="" />
                    </div>
                    <div className="uk-selection-proof">
                      <strong>Official Partner</strong>
                      <small>{EAST_MANCHESTER_LEAGUE} approved collection with licensed club badges.</small>
                    </div>
                  </>
                ) : (
                  <div className="uk-wizard-custom-card">
                    <label>
                      Club / team name {squadInviteContext ? <em>set by your organiser</em> : <em>optional</em>}
                      <input
                        value={order.club}
                        onChange={(event) => updateCustomClub(event.target.value)}
                        placeholder="Enter your club or team name"
                        readOnly={Boolean(squadInviteContext)}
                        aria-readonly={squadInviteContext ? true : undefined}
                      />
                    </label>
                  </div>
                )}
              </div>
              {order.type !== 'single' && (
                <div className="uk-squad-edit-bar">
                  <button type="button" onClick={() => selectAdjacentPlayer(-1)} disabled={selectedIndex <= 0}>Previous</button>
                  <span>{selectedIndex + 1} of {order.players.length}</span>
                  <button type="button" onClick={() => selectAdjacentPlayer(1)} disabled={selectedIndex >= order.players.length - 1}>Next</button>
                </div>
              )}
              <div className="uk-personalise-style">
                <div className="uk-personalise-style-head">
                  <span>
                    <strong>{selectedTemplate(order, selectedPlayer).name}</strong>
                    <small>Swipe to change style</small>
                  </span>
                  <em>{order.collectionType === 'custom' ? 'Custom collection style' : `Best match for ${playerClubName(order, selectedPlayer)}`}</em>
                </div>
                <div className="uk-style-rail">
                  <button type="button" className="uk-style-rail-btn prev" aria-label="Previous style" onClick={() => scrollStyleRail(-1)}>
                    <svg viewBox="0 0 24 24" role="img" aria-hidden="true">
                      <path d="M15 5l-7 7 7 7" />
                    </svg>
                  </button>
                  <div className="uk-style-carousel compact" ref={styleRailRef}>
                    {orderedTemplates.map((template) => (
                      <button
                        key={template.id}
                        type="button"
                        className={selectedTemplate(order, selectedPlayer).id === template.id ? 'active' : ''}
                        onClick={() => chooseTemplate(template.id)}
                      >
                        <PlayerCard
                          order={{ ...order, templateDefault: template.id }}
                          player={selectedPlayer ? { ...selectedPlayer, templateId: template.id } : createPlayer({ templateId: template.id })}
                          compact
                        />
                        <strong>{template.name}</strong>
                        {order.collectionType === 'official' && template.id === preferredTemplateForClub(playerClubId(order, selectedPlayer)) && <small>Best match</small>}
                      </button>
                    ))}
                  </div>
                  <button type="button" className="uk-style-rail-btn next" aria-label="Next style" onClick={() => scrollStyleRail(1)}>
                    <svg viewBox="0 0 24 24" role="img" aria-hidden="true">
                      <path d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="uk-edit-preview">
                <PlayerCard order={order} player={selectedPlayer} side={cardSide} />
              </div>
              {selectedPlayer.photo ? (
                <div className="uk-crop-controls">
                  <label>
                    Zoom <b>{selectedPlayer.photo.crop.scale.toFixed(1)}x</b>
                    <input
                      type="range"
                      min={0.7}
                      max={1.8}
                      step={0.05}
                      value={selectedPlayer.photo.crop.scale}
                      onChange={(event) => patchPlayer(selectedPlayer.id, { photo: selectedPlayer.photo ? { ...selectedPlayer.photo, crop: { ...selectedPlayer.photo.crop, scale: Number(event.target.value) } } : undefined })}
                    />
                  </label>
                  <label>
                    Horizontal <b>{selectedPlayer.photo.crop.x}</b>
                    <input
                      type="range"
                      min={-40}
                      max={40}
                      step={1}
                      value={selectedPlayer.photo.crop.x}
                      onChange={(event) => patchPlayer(selectedPlayer.id, { photo: selectedPlayer.photo ? { ...selectedPlayer.photo, crop: { ...selectedPlayer.photo.crop, x: Number(event.target.value) } } : undefined })}
                    />
                  </label>
                  <label>
                    Vertical <b>{selectedPlayer.photo.crop.y}</b>
                    <input
                      type="range"
                      min={-40}
                      max={40}
                      step={1}
                      value={selectedPlayer.photo.crop.y}
                      onChange={(event) => patchPlayer(selectedPlayer.id, { photo: selectedPlayer.photo ? { ...selectedPlayer.photo, crop: { ...selectedPlayer.photo.crop, y: Number(event.target.value) } } : undefined })}
                    />
                  </label>
                </div>
              ) : (
                <label className="uk-photo-needed">
                  <strong>Upload player photo</strong>
                  <span>Add the photo first, then the positioning tools will appear.</span>
                  <input type="file" accept="image/*" hidden onChange={(event) => assignPhoto(selectedPlayer.id, event.target.files?.[0])} />
                </label>
              )}
              <div className="uk-card-side-toggle wide" aria-label="Choose card side">
                <button type="button" className={cardSide === 'front' ? 'active' : ''} onClick={() => setCardSide('front')}>Front</button>
                <button type="button" className={cardSide === 'back' ? 'active' : ''} onClick={() => setCardSide('back')}>Back</button>
              </div>
              <PlayerEditor order={order} player={selectedPlayer} onPatch={patchPlayer} onPhoto={assignPhoto} onClub={selectPlayerClub} onBadge={assignPlayerBadge} />
              <button
                type="button"
                className="uk-wizard-primary"
                onClick={() => {
                  // Single-player orders skip the team-only Approve step, so
                  // there's no separate screen left to approve the one card —
                  // do it here, same as clicking "Approve card" would have.
                  if (approveOrReviewStep === 'review') approveAllReady();
                  setActiveStepId(approveOrReviewStep);
                }}
              >
                {approveOrReviewStep === 'approve' ? 'Approve cards' : 'Review order'}
              </button>
            </section>
          )}

          {activeStepId === 'approve' && (
            <section className="uk-wizard-panel">
              <p className="uk-wizard-kicker">Approve cards</p>
              <h1>Ready for production?</h1>
              <p className="uk-wizard-copy">Complete each card, then approve the ones you want printed.</p>
              {canManageAsTeam ? (
                <div className="uk-review-toolbar">
                  <button type="button" onClick={() => addPlayerToCurrentTeam()} disabled={!canAddPlayer({ ...order, type: order.type === 'single' ? 'set' : order.type })}>
                    Add player
                  </button>
                  <button type="button" onClick={addTeam} disabled={!canAddPlayer({ ...order, type: order.type === 'single' ? 'set' : order.type })}>
                    Add another team
                  </button>
                  {!canAddPlayer({ ...order, type: order.type === 'single' ? 'set' : order.type }) && (
                    <p style={{ fontSize: 13, opacity: 0.7, margin: '8px 0 0', flexBasis: '100%' }}>
                      This order has reached the {DIRECT_BUILDER_MAX_PAID_PLAYERS}-player limit for this pilot.
                    </p>
                  )}
                </div>
              ) : null}
              <div className="uk-review-groups">
                {reviewGroups.map((group) => (
                  <section key={group.id} className="uk-review-group">
                    <header className="uk-review-group-head">
                      <img src={group.badge} alt="" />
                      <div>
                        <strong>{group.name}</strong>
                        <span>{group.players.length} card{group.players.length === 1 ? '' : 's'}</span>
                      </div>
                      {canManageAsTeam ? (
                        <button type="button" onClick={() => order.collectionType === 'custom' ? addPlayerToCurrentTeam() : addPlayerToClub(group.id)} disabled={addDisabled}>
                          Add player
                        </button>
                      ) : null}
                    </header>
                    <div className="uk-review-list">
                      {group.players.map((player) => {
                        const index = order.players.findIndex((item) => item.id === player.id);
                        const status = derivePlayerStatus(player);
                        const missing = missingItems(player);
                        const score = completionScore(player);
                        return (
                          <article key={player.id}>
                            <PlayerCard order={order} player={player} compact />
                            <div>
                              <h3>{playerLabel(player, index)}</h3>
                              <p>{selectedTemplate(order, player).name} &middot; {playerClubName(order, player)} &middot; #{player.kitNo || '--'} &middot; Qty {player.prints}</p>
                              <span className={statusClass(status)}>{statusCopy[status]}</span>
                              <div className="uk-completion-meter" aria-label={`${score}% complete`}>
                                <span style={{ width: `${score}%` }} />
                              </div>
                              <small>{score}% complete</small>
                              {missing.length > 0 && <em>Missing {missing.join(', ')}</em>}
                            </div>
                            {status === 'ready' ? (
                              <button type="button" onClick={() => approvePlayer(player.id)}>Approve card</button>
                            ) : status === 'approved' ? (
                              <button type="button" className="approved" onClick={() => setActiveStepId('review')}>Ready</button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedId(player.id);
                                  setActiveStepId('personalise');
                                }}
                              >
                                {reviewActionCopy(player)}
                              </button>
                            )}
                            <div className="uk-review-card-actions">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedId(player.id);
                                  setActiveStepId('personalise');
                                }}
                              >
                                Edit card
                              </button>
                              {order.players.length > 1 ? (
                                <button type="button" onClick={() => removePlayer(player.id)}>
                                  Remove
                                </button>
                              ) : null}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
              {!canManageAsTeam ? (
                <div className="uk-review-add-card">
                  <span>
                    <strong>Need another card?</strong>
                    <small>Add another player to this order without starting again.</small>
                  </span>
                  <button type="button" onClick={() => addPlayerToCurrentTeam()}>
                    Add another player
                  </button>
                </div>
              ) : null}
              <div className="uk-review-total">
                <span>Approved prints</span><b>{summary.approvedPrints}</b>
              </div>
              <PricingSummaryCard state={quoteState} onRetry={retryQuote} variant="compact" />
              <p className="uk-review-helper">{reviewHelper}</p>
              <button type="button" className="uk-wizard-primary" onClick={handleReviewPrimary} disabled={reviewPrimaryDisabled}>
                {reviewPrimaryLabel}
              </button>
            </section>
          )}

          {activeStepId === 'review' && squadInviteContext && (() => {
            const squadInvitePlayer = order.players[0];
            const nameParts = squadInvitePlayer.name.trim().split(/\s+/).filter(Boolean);
            const previewFirstName = nameParts[0] || '';
            const previewSurnameInitial = (nameParts.length > 1 ? nameParts[nameParts.length - 1] : previewFirstName).charAt(0).toUpperCase();
            const previewDisplayName = previewFirstName ? `${previewFirstName}${previewSurnameInitial ? ` ${previewSurnameInitial}.` : ''}` : 'Not yet named';
            const previewSquadNumber = /^[0-9]+$/.test(squadInvitePlayer.kitNo.trim()) ? squadInvitePlayer.kitNo.trim() : 'Not set';
            const hasDeclarationErrors = Object.values(squadInviteDeclarationErrors).some(Boolean);
            return (
              <section className="uk-wizard-panel uk-squad-review">
                {squadInvitePhase === 'success' ? (
                  <div className="uk-squad-review-success" role="status" aria-live="polite">
                    <p className="uk-wizard-kicker">Squad Invite</p>
                    <h1>Your child&apos;s card is saved.</h1>
                    {order.club && <p className="uk-squad-invite-success-team">{order.club}</p>}
                    <ul className="uk-squad-invite-success-list">
                      <li>A payment request will be emailed to you once your team&apos;s price is confirmed — nothing is charged today.</li>
                      <li>Emblem staff review this card before it goes into production.</li>
                      <li>Production begins only after payment, in a future approved live flow.</li>
                      <li>Cards are delivered together to the approved organiser/coach.</li>
                      <li>Your organiser sees aggregate team progress only — never this card&apos;s details.</li>
                    </ul>
                    <div className="uk-squad-invite-success-actions">
                      <a className="uk-wizard-primary" href="/squad-invite/join">Return to Squad Invite</a>
                      <a className="uk-squad-invite-success-secondary" href="/">Return to Emblem homepage</a>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="uk-wizard-kicker">Squad Invite</p>
                    <h1>Review and save your child&apos;s card</h1>
                    <p className="uk-wizard-copy">
                      This creates one private Squad Invite commitment for {order.club || 'your team'}. It is private to you — your organiser sees aggregate progress only, never these details.
                    </p>

                    <div className="uk-squad-review-grid">
                      <div className="uk-squad-review-preview">
                        <div className="uk-edit-preview">
                          <PlayerCard order={order} player={squadInvitePlayer} side={cardSide} />
                        </div>
                        <div className="uk-card-side-toggle wide" aria-label="Choose card side">
                          <button type="button" className={cardSide === 'front' ? 'active' : ''} onClick={() => setCardSide('front')}>Front</button>
                          <button type="button" className={cardSide === 'back' ? 'active' : ''} onClick={() => setCardSide('back')}>Back</button>
                        </div>
                      </div>

                      <div className="uk-squad-review-confirm">
                        <dl className="uk-squad-review-summary">
                          <div><dt>Team</dt><dd>{order.club || 'Not set'}</dd></div>
                          <div><dt>Player</dt><dd>{previewDisplayName}</dd></div>
                          <div><dt>Squad number</dt><dd>{previewSquadNumber}</dd></div>
                          <div><dt>Template</dt><dd>{selectedTemplate(order, squadInvitePlayer).name}</dd></div>
                          <div><dt>Quantity</dt><dd>{squadInvitePlayer.prints}</dd></div>
                          <div><dt>Delivery</dt><dd>To your approved organiser/coach</dd></div>
                          <div><dt>Payment</dt><dd>Requested once team price is confirmed</dd></div>
                        </dl>

                        <div className="uk-squad-review-callout">
                          <p className="uk-squad-review-callout-title">Payment is required once your team&apos;s price is confirmed.</p>
                          <p>No card details are collected here — you&apos;ll be sent a separate payment request by email once your team&apos;s final price is confirmed.</p>
                        </div>

                        {squadInviteOutcome === 'sign_in_required' && (
                          <p role="alert" className="uk-enquiry-error">
                            Your session has expired. <Link href="/squad-invite/join">Verify your email again</Link> to continue.
                          </p>
                        )}
                        {squadInviteOutcome === 'unavailable' && (
                          <p role="alert" className="uk-enquiry-error">
                            This couldn&apos;t be completed right now — it may already be saved, or the window to make changes has closed. Please try again shortly.
                          </p>
                        )}
                        {squadInviteOutcome === 'campaign_closed' && (
                          <p role="alert" className="uk-enquiry-error">
                            This team&apos;s Squad Invite has been closed by their organiser. Please contact them directly if you believe this is a mistake.
                          </p>
                        )}
                        {squadInviteOutcome === 'validation' && !hasDeclarationErrors && (
                          <p role="alert" className="uk-enquiry-error">
                            Please check the photo and name on the personalise step, then try again.
                          </p>
                        )}
                        {squadInviteOutcome === 'network' && (
                          <p role="alert" className="uk-enquiry-error">
                            A network problem stopped the request. Check your connection and try again.
                          </p>
                        )}
                        {squadInviteOutcome === 'photo_upload_failed' && (
                          <p role="alert" className="uk-enquiry-error">
                            Your photo couldn&apos;t be saved. Your details and declarations are still here — please try again, or use a different photo.
                          </p>
                        )}

                        <form onSubmit={submitSquadInviteCommitment} noValidate>
                          <fieldset className="uk-squad-review-declarations">
                            <legend>Required declarations</legend>
                            {hasDeclarationErrors && (
                              <p role="alert" id="squad-invite-declarations-error" className="uk-squad-review-declaration-error-summary">
                                Please accept all four declarations before saving.
                              </p>
                            )}
                            {SQUAD_INVITE_REQUIRED_DECLARATIONS.map((declaration) => {
                              const checked = Boolean(squadInviteAccepted[declaration.purpose]);
                              const invalid = Boolean(squadInviteDeclarationErrors[declaration.purpose]);
                              return (
                                <label
                                  key={declaration.purpose}
                                  htmlFor={`squad-invite-${declaration.purpose}`}
                                  className={`uk-squad-declaration-row${checked ? ' is-checked' : ''}${invalid ? ' is-invalid' : ''}`}
                                >
                                  <input
                                    ref={(el) => { squadInviteDeclarationRefs.current[declaration.purpose] = el; }}
                                    id={`squad-invite-${declaration.purpose}`}
                                    type="checkbox"
                                    checked={checked}
                                    aria-invalid={invalid}
                                    aria-describedby={invalid ? 'squad-invite-declarations-error' : undefined}
                                    onChange={(event) => {
                                      setSquadInviteAccepted((current) => ({ ...current, [declaration.purpose]: event.target.checked }));
                                      if (event.target.checked) {
                                        setSquadInviteDeclarationErrors((current) => {
                                          if (!current[declaration.purpose]) return current;
                                          const next = { ...current };
                                          delete next[declaration.purpose];
                                          return next;
                                        });
                                      }
                                    }}
                                  />
                                  <span>{declaration.label}</span>
                                </label>
                              );
                            })}
                          </fieldset>
                          <button
                            type="submit"
                            className="uk-wizard-primary uk-squad-review-submit"
                            disabled={squadInviteSubmitting}
                            aria-busy={squadInviteSubmitting}
                          >
                            {squadInviteSubmitting ? 'Saving…' : "Save my child's card"}
                          </button>
                          <p className="uk-squad-review-submit-note">
                            Your child&apos;s card joins the team&apos;s production queue now. You&apos;ll be sent a payment request by email once the team&apos;s price is confirmed — your organiser sees aggregate progress only, never these details.
                          </p>
                        </form>
                      </div>
                    </div>
                  </>
                )}
              </section>
            );
          })()}

          {activeStepId === 'review' && !squadInviteContext && enquiryStatus === 'sent' && submittedAuthorityStatus === 'guardian_approval_pending' && (
            <GuardianPendingScreen orderId={submittedOrderId} />
          )}

          {activeStepId === 'adult-permission' && !squadInviteContext && (
            <AdultPermissionStep
              getSubmissionKey={ensureSubmissionKey}
              onBack={() => setActiveStepId('review')}
              onConfirmed={() => {
                // record_builder_authority_declaration succeeding is not
                // itself visible to the customer — the only screens that
                // show the outcome (the ordinary "Order received" panel,
                // or GuardianPendingScreen for a non-guardian relationship)
                // are both gated on activeStepId === 'review'. Without
                // this, submitEnquiry below still runs and genuinely
                // completes the order server-side, but activeStepId stays
                // 'adult-permission' forever, so AdultPermissionStep just
                // resets to its idle state — busy releases, there's no
                // error to show because nothing failed, and the screen
                // never advances. That is the exact "nothing happening"
                // outcome a live re-test surfaced: the order was really
                // submitted, but the UI had nowhere to go and show it.
                setActiveStepId('review');
                setAdultPermissionConfirmed(true);
                submitEnquiry({ preventDefault: () => {} } as FormEvent<HTMLFormElement>);
              }}
            />
          )}

          {activeStepId === 'review' && !squadInviteContext && !(enquiryStatus === 'sent' && submittedAuthorityStatus === 'guardian_approval_pending') && (
            <section className="uk-wizard-panel">
              <p className="uk-wizard-kicker">Review order</p>
              <h1>{enquiryStatus === 'sent' ? 'Order received.' : 'Review your order.'}</h1>
              <p className="uk-wizard-copy">
                {enquiryStatus === 'sent'
                  ? 'We have your production request and will email you within one business day.'
                  : summary.checkoutEligible
                    ? 'Your cards are ready. We will review your order, confirm print quantity, delivery cost and send you a secure payment link.'
                    : 'Approve at least one card to continue.'}
              </p>
              <div className="uk-production-snapshot">
                <div>
                  <span>Clubs</span>
                  <strong>{approvedGroups.length}</strong>
                </div>
                <div>
                  <span>Players</span>
                  <strong>{summary.approvedPlayers.length}</strong>
                </div>
                <div>
                  <span>Prints</span>
                  <strong>{summary.approvedPrints}</strong>
                </div>
                <div>
                  <span>Card subtotal</span>
                  <strong>{quoteSubtotalLabel(quoteState)}</strong>
                </div>
              </div>
              <div className="uk-order-club-list">
                <h3>Your order</h3>
                {approvedGroups.length > 0 ? (
                  approvedGroups.map((group) => {
                    const prints = group.players.reduce((total, player) => total + player.prints, 0);
                    return (
                      <details key={group.id} className="uk-order-club-row">
                        <summary>
                          <img src={group.badge} alt="" />
                          <span>
                            <strong>{group.name}</strong>
                            <small>{group.players.length} player{group.players.length === 1 ? '' : 's'} &middot; {prints} print{prints === 1 ? '' : 's'}</small>
                          </span>
                        </summary>
                        <div className="uk-order-player-list">
                          {group.players.map((player) => (
                            <button
                              key={player.id}
                              type="button"
                              disabled={!canEditOrder}
                              onClick={() => {
                                setSelectedId(player.id);
                                setActiveStepId('personalise');
                              }}
                            >
                              <span>
                                <strong>{playerLabel(player)}</strong>
                                <small>{selectedTemplate(order, player).name} &middot; #{player.kitNo || '--'} &middot; Qty {player.prints}</small>
                              </span>
                            </button>
                          ))}
                        </div>
                      </details>
                    );
                  })
                ) : (
                  <p>Approved cards will appear here grouped by club.</p>
                )}
              </div>
              <div className="uk-order-summary-card">
                <div>
                  <span>Approved cards</span>
                  <strong>{summary.approvedPlayers.length}</strong>
                </div>
                <div>
                  <span>Approved prints</span>
                  <strong>{summary.approvedPrints}</strong>
                </div>
              </div>
              <PricingSummaryCard state={quoteState} onRetry={retryQuote} variant="full" />
              <CoachCardSection
                order={order}
                eligible={coachCardEligibility.eligible}
                draft={coachCardDraft}
                options={coachCardOptions}
                onChange={patchCoachCardDraft}
                onSelectTeam={(option) => setCoachCardDraft((current) => selectCoachCardTeam(current, option))}
              />
              <form className="uk-enquiry-form" onSubmit={handleReviewFormSubmit}>
                <div className="uk-enquiry-form-head">
                  <h3>Where should we send the order link?</h3>
                  <p>We already have the club and badge for each card. Use this to confirm delivery timing and the payment link.</p>
                </div>
                <label>
                  Name
                  <input
                    value={enquiry.name}
                    autoComplete="name"
                    onChange={(event) => setEnquiry((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Parent or coach name"
                    required
                  />
                </label>
                <label>
                  Email
                  <input
                    value={enquiry.email}
                    type="email"
                    autoComplete="email"
                    onChange={(event) => setEnquiry((current) => ({ ...current, email: event.target.value }))}
                    placeholder="you@example.com"
                    required
                  />
                </label>
                <label>
                  Phone <span>optional</span>
                  <input
                    value={enquiry.phone}
                    type="tel"
                    autoComplete="tel"
                    onChange={(event) => setEnquiry((current) => ({ ...current, phone: event.target.value }))}
                    placeholder="Best number for order questions"
                  />
                </label>
                <label className="wide">
                  Anything you would like us to know? <span>optional</span>
                  <textarea
                    value={enquiry.notes}
                    onChange={(event) => setEnquiry((current) => ({ ...current, notes: event.target.value }))}
                    placeholder="Extra prints, deadline, delivery instructions, or anything the Emblem team should know."
                    rows={4}
                  />
                </label>
                {enquiryStatus === 'sent' && (
                  <div className="uk-enquiry-success">
                    <strong>Order received.</strong>
                    <span>We will email you within one business day with the final print total, delivery options and secure payment link.</span>
                  </div>
                )}
                {enquiryStatus === 'error' && enquiryConflict && (
                  <div role="alert">
                    <p className="uk-enquiry-error">
                      This order couldn&apos;t be resubmitted safely — your earlier attempt may have already gone through with different
                      details, so resending this exact form could create a mismatched order. Nothing has been created from this attempt.
                      Start a new order to try again — your card details are still here.
                    </p>
                    <button type="button" className="uk-wizard-primary compact" onClick={startNewOrder}>
                      Start a new order
                    </button>
                  </div>
                )}
                {enquiryStatus === 'error' && !enquiryConflict && <p className="uk-enquiry-error">{enquiryError}</p>}
                {quoteBlocksSubmission && enquiryStatus !== 'sent' && (
                  <p id="uk-quote-block-hint" className="uk-quote-block-hint" aria-live="polite">
                    {quoteState.status === 'error'
                      ? "We couldn't confirm your card price — tap Try again above before continuing."
                      : 'Waiting for your authoritative card price before you can continue.'}
                  </p>
                )}
                {coachCardBlocksSubmission && enquiryStatus !== 'sent' && (
                  <p id="uk-coach-card-block-hint" className="uk-quote-block-hint" aria-live="polite">
                    Finish your free coach card details above before continuing.
                  </p>
                )}
                {enquiryStatus !== 'sent' && !enquiryConflict ? (
                  <button
                    type="submit"
                    className="uk-wizard-primary"
                    disabled={!canSendEnquiry || enquiryStatus === 'sending'}
                    aria-describedby={
                      quoteBlocksSubmission ? 'uk-quote-block-hint' : coachCardBlocksSubmission ? 'uk-coach-card-block-hint' : undefined
                    }
                  >
                    {enquiryStatus === 'sending' ? 'Preparing your cards...' : 'Continue to checkout'}
                  </button>
                ) : null}
              </form>
              <div className="uk-next-steps">
                <h3>What happens next?</h3>
                <ol>
                  <li><strong>We review your cards</strong><span>Artwork, badges and print quantities are checked.</span></li>
                  <li><strong>We email a payment link</strong><span>You confirm delivery and pay securely.</span></li>
                  <li><strong>Production begins</strong><span>Your approved cards move into print.</span></li>
                  <li><strong>Cards delivered</strong><span>Your keepsakes arrive ready to share.</span></li>
                </ol>
              </div>
              <div className="uk-handoff-box">
                <h3>Order summary</h3>
                <p>
                  {summary.approvedPlayers.length} card{summary.approvedPlayers.length === 1 ? '' : 's'} &middot; {summary.approvedPrints} print{summary.approvedPrints === 1 ? '' : 's'} &middot; {quoteSubtotalLabel(quoteState)}
                </p>
              </div>
              {/* Guardian-controlled card-front sharing (Work Package B,
                  draft) — outer gate here is a first-pass filter matching
                  what the server-side eligibility check (migration 0078)
                  independently re-verifies as the actual authority: a
                  direct parent/legal guardian's own single-child order.
                  order.type === 'single' mirrors the same "whole-team
                  orders have only one authority declaration for many
                  children" limitation the migration's own header comment
                  documents — ShareCardSheet still fetches and trusts only
                  the server's own answer, never this client gate alone. */}
              {(() => {
                const soleApprovedPlayer = summary.approvedPlayers[0];
                if (enquiryStatus !== 'sent' || submittedAuthorityStatus !== 'confirmed' || order.type !== 'single' || !submittedOrderId || !soleApprovedPlayer) {
                  return null;
                }
                return (
                  <ShareCardSheet
                    orderId={submittedOrderId}
                    getShareImage={captureShareImage}
                  />
                );
              })()}
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

function SquadUploadQueue({
  order,
  selectedId,
  summary,
  canAdd,
  onSelect,
  onPatch,
  onPhoto,
  onRemove,
  onDuplicate,
  onAdd,
}: {
  order: OrderDraft;
  selectedId: string;
  summary: ReturnType<typeof summarizeOrder>;
  canAdd: boolean;
  onSelect: (id: string) => void;
  onPatch: (id: string, patch: Partial<PlayerDraft>) => void;
  onPhoto: (id: string, file?: File) => void;
  onRemove: (id: string) => void;
  onDuplicate: (player: PlayerDraft) => void;
  onAdd: () => void;
}) {
  const selectedPlayer = order.players.find((player) => player.id === selectedId) || order.players[0];

  return (
    <div className="uk-squad-upload">
      <div className="uk-squad-summary">
        <span>
          <strong>{order.players.length}</strong>
          players
        </span>
        <span>
          <strong>{summary.counts.ready}</strong>
          ready
        </span>
        <span>
          <strong>{summary.counts['needs-photo']}</strong>
          need photos
        </span>
        <span>
          <strong>{summary.counts['needs-details']}</strong>
          need details
        </span>
      </div>

      {selectedPlayer && (
        <div className="uk-selected-player-card">
          <span className="uk-player-strip-photo">
            {selectedPlayer.photo?.srcUrl ? <img src={selectedPlayer.photo.srcUrl} alt="" /> : <b>No photo</b>}
          </span>
          <div>
            <small>Selected player</small>
            <strong>{playerLabel(selectedPlayer)}</strong>
            <span className={statusClass(derivePlayerStatus(selectedPlayer))}>{statusCopy[derivePlayerStatus(selectedPlayer)]}</span>
          </div>
        </div>
      )}

      <div className="uk-squad-roster" aria-label="Squad player queue">
        {order.players.map((player, index) => {
          const status = derivePlayerStatus(player);
          return (
            <article key={player.id} className={selectedId === player.id ? 'active' : ''}>
              <button type="button" className="uk-squad-roster-photo" onClick={() => onSelect(player.id)} aria-label={`Select ${playerLabel(player, index)}`}>
                {player.photo?.srcUrl ? <img src={player.photo.srcUrl} alt="" /> : <span>No photo</span>}
              </button>
              <div className="uk-squad-roster-fields">
                <label>
                  Name
                  <input value={player.name} placeholder={`Player ${index + 1}`} onChange={(event) => onPatch(player.id, { name: event.target.value })} />
                </label>
                <label>
                  Position
                  <select value={player.position} onChange={(event) => onPatch(player.id, { position: event.target.value })}>
                    <option value="">Select</option>
                    {sportConfig[order.sport].positions.map((position) => <option key={position}>{position}</option>)}
                  </select>
                </label>
                <label>
                  Kit
                  <input value={player.kitNo} onChange={(event) => onPatch(player.id, { kitNo: event.target.value })} />
                </label>
              </div>
              <div className="uk-squad-roster-actions">
                <span className={statusClass(status)}>{statusCopy[status]}</span>
                <label>
                  Photo
                  <input type="file" accept="image/*" hidden onChange={(event) => onPhoto(player.id, event.target.files?.[0])} />
                </label>
                <button type="button" onClick={() => onSelect(player.id)}>Edit</button>
                <button type="button" onClick={() => onDuplicate(player)} disabled={!canAdd}>Copy</button>
                <button type="button" onClick={() => onRemove(player.id)} disabled={order.players.length <= 1}>Remove</button>
              </div>
            </article>
          );
        })}
      </div>

      <button type="button" className="uk-squad-add" onClick={onAdd} disabled={!canAdd}>Add another player</button>
    </div>
  );
}

function PlayerStrip({
  order,
  selectedId,
  onSelect,
}: {
  order: OrderDraft;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="uk-player-strip" aria-label="Choose player to edit">
      {order.players.map((player, index) => {
        const status = derivePlayerStatus(player);
        return (
          <button
            key={player.id}
            type="button"
            className={selectedId === player.id ? 'active' : ''}
            onClick={() => onSelect(player.id)}
          >
            <span className="uk-player-strip-photo">
              {player.photo?.srcUrl ? <img src={player.photo.srcUrl} alt="" /> : <b>No photo</b>}
            </span>
            <span>
              <strong>{playerLabel(player, index)}</strong>
              <small>{statusCopy[status]}</small>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function PlayerEditor({
  order,
  player,
  onPatch,
  onPhoto,
  onClub,
  onBadge,
}: {
  order: OrderDraft;
  player: PlayerDraft;
  onPatch: (id: string, patch: Partial<PlayerDraft>) => void;
  onPhoto: (id: string, file?: File) => void;
  onClub: (playerId: string, clubId: string) => void;
  onBadge: (playerId: string, file?: File) => void;
}) {
  const status = derivePlayerStatus(player);
  const stats = sportConfig[order.sport].stats;
  const isCustomCollection = order.collectionType === 'custom';

  return (
    <div className="uk-player-editor">
      <div className="uk-editor-head">
        <span className={statusClass(status)}>{statusCopy[status]}</span>
        <strong>{playerLabel(player)}</strong>
      </div>
      <label className="uk-upload-large">
        {player.photo ? 'Replace photo' : 'Upload photo'}
        <input type="file" accept="image/*" hidden onChange={(event) => onPhoto(player.id, event.target.files?.[0])} />
      </label>
      <div className="uk-editor-badge-picker">
        <div className="uk-editor-badge-head">
          <span>
            <strong>Club badge</strong>
            <small>
              {isCustomCollection
                ? 'Shown as the badge for this custom collection.'
                : 'Shown with the East Manchester league crest on the card.'}
            </small>
          </span>
          <img src={playerBadge(order, player)} alt="" />
        </div>
        {isCustomCollection ? (
          <div className="uk-editor-badge-row single">
            <label>
              Club / team name
              <input
                value={player.club}
                onChange={(event) => onPatch(player.id, { club: event.target.value, clubEdited: true })}
                placeholder={order.club || 'Enter club or team name'}
              />
            </label>
          </div>
        ) : (
          <>
            <div className="uk-editor-badge-row">
              <select
                value={playerClubId(order, player)}
                onChange={(event) => onClub(player.id, event.target.value)}
              >
                {EMJFL_CLUBS.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
              </select>
              <label>
                Upload badge
                <input type="file" accept="image/*" hidden onChange={(event) => onBadge(player.id, event.target.files?.[0])} />
              </label>
            </div>
            <div className="uk-editor-badge-strip" aria-label="Choose club badge while editing">
              {EMJFL_CLUBS.map((club) => (
                <button
                  key={club.id}
                  type="button"
                  className={playerClubId(order, player) === club.id ? 'active' : ''}
                  onClick={() => onClub(player.id, club.id)}
                  title={club.name}
                >
                  <img src={club.badgePath} alt="" />
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="uk-field-stack">
        <label>
          Name
          <input value={player.name} onChange={(event) => onPatch(player.id, { name: event.target.value })} />
        </label>
        <label>
          Position
          <select value={player.position} onChange={(event) => onPatch(player.id, { position: event.target.value })}>
            <option value="">Select</option>
            {sportConfig[order.sport].positions.map((position) => <option key={position}>{position}</option>)}
          </select>
        </label>
        <label>
          Kit number
          <input value={player.kitNo} onChange={(event) => onPatch(player.id, { kitNo: event.target.value })} />
        </label>
        <label>
          Prints
          <input
            type="number"
            min={1}
            max={50}
            value={player.prints}
            onChange={(event) => onPatch(player.id, { prints: Math.max(1, Number(event.target.value) || 1) })}
          />
        </label>
      </div>
      <div className="uk-stat-grid">
        {stats.map((stat) => (
          <label key={stat.key}>
            {stat.label}
            <input
              value={player.stats[stat.key] || ''}
              onChange={(event) => onPatch(player.id, { stats: { ...player.stats, [stat.key]: event.target.value } })}
            />
          </label>
        ))}
      </div>
      {player.approvedAt && <p className="uk-approval-note">Approved cards are locked. Any edit asks for confirmation and returns the card to review.</p>}
    </div>
  );
}

/**
 * Maps live wizard state to the same normalized CardFaceData shape
 * Collection OS derives from a persisted card_definitions row
 * (src/lib/card-definition.tsx) — the only thing that's Builder-specific
 * here is *where the values come from*; how they get rendered is the one
 * shared CardFace component, not a second implementation of it.
 */
function orderPlayerToFaceData(order: OrderDraft, player: PlayerDraft): CardFaceData {
  const template = selectedTemplate(order, player);
  return {
    templateId: template.id,
    sport: 'soccer',
    name: player.name || 'Player 1',
    number: player.kitNo || null,
    team: playerClubName(order, player) || 'Club Name',
    position: player.position || 'Position',
    logo: playerBadge(order, player),
    photoCrop: player.photo ? { x: player.photo.crop.x || 0, y: player.photo.crop.y || 0, scale: player.photo.crop.scale || 1 } : null,
    stats: player.stats,
  };
}

function PlayerCard({
  order,
  player,
  compact = false,
  side = 'front',
  forPrint = false,
}: {
  order: OrderDraft;
  player: PlayerDraft;
  compact?: boolean;
  side?: CardSide;
  /** True only inside the hidden print-capture rig — see pdf-generator.ts's
   * buildFullBleedRaster doc comment for why print capture needs the card
   * unclipped (borderRadius: 0) while every on-screen render stays rounded. */
  forPrint?: boolean;
}) {
  const template = selectedTemplate(order, player);
  const stats = sportConfig[order.sport].stats;
  const useRealBuilderArt =
    (order.collectionType === 'official' && (template.id === 'emjfl-official' || isHollinwoodTemplateId(template.id))) ||
    (order.collectionType === 'custom' && isCustomCollectionTemplateId(template.id));

  if (useRealBuilderArt) {
    return (
      <CardFace
        className={`uk-real-card ${compact ? 'compact' : ''}`}
        data={orderPlayerToFaceData(order, player)}
        side={side}
        size={compact ? 170 : 340}
        photoUrl={player.photo?.srcUrl || null}
        style={forPrint ? { borderRadius: 0 } : undefined}
      />
    );
  }

  if (side === 'back') {
    return (
      <div className={`uk-player-card back ${compact ? 'compact' : ''}`} style={{ background: template.background }}>
        {order.collectionType === 'official' && template.frameAsset && <img className="uk-template-frame" src={template.frameAsset} alt="" />}
        <div className="uk-back-top">
          <div className="uk-back-logo">{playerBadge(order, player) ? <img src={playerBadge(order, player)} alt="" /> : <span>Club<br />logo</span>}</div>
          <div>
            <small>Emblem UK football card</small>
            <h3>{playerClubName(order, player) || 'Club name'}</h3>
            <p>{order.ageGroup || 'Age group'} / {order.season}</p>
          </div>
        </div>
        <div className="uk-back-player">
          <span>#{player.kitNo || '00'}</span>
          <h3>{player.name || 'PLAYER 1'}</h3>
          <p>{player.position || 'Position'} / {order.league || 'Grassroots football'}</p>
        </div>
        <div className="uk-back-stats">
          {stats.map((stat) => (
            <span key={stat.key}>
              <strong>{player.stats[stat.key] || '-'}</strong>
              {stat.label}
            </span>
          ))}
        </div>
        <div className="uk-back-memory">
          <strong>Digital profile</strong>
          <span>Season stats, highlights, photos and memories attached to this keepsake.</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`uk-player-card front ${compact ? 'compact' : ''}`} style={{ background: template.background }}>
      {order.collectionType === 'official' && template.frameAsset && <img className="uk-template-frame" src={template.frameAsset} alt="" />}
      <div className="uk-card-logo">{playerBadge(order, player) ? <img src={playerBadge(order, player)} alt="" /> : <span>Logo</span>}</div>
      <div className="uk-card-photo">
        {player.photo?.srcUrl ? <img src={player.photo.srcUrl} alt="" /> : <span>Photo</span>}
      </div>
      <div className="uk-card-kit">{player.kitNo || '00'}</div>
      <div className="uk-card-band">
        <h3>{player.name || 'PLAYER 1'}</h3>
        <p>{playerClubName(order, player) || 'Club name'} / {player.position || 'Position'}</p>
      </div>
      <div className="uk-card-stats">
        {stats.map((stat) => (
          <span key={stat.key}>
            <strong>{player.stats[stat.key] || '-'}</strong>
            {stat.label}
          </span>
        ))}
      </div>
      <small>EMBLEM UK / {order.season}</small>
    </div>
  );
}
