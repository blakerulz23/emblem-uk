import { selectedTemplate, summarizeOrder, type OrderDraft, type PlayerDraft, type TemplateId } from './emblem-uk-builder';
import { isQuoteFreshForCounts, type OrderPricingQuoteState } from './pricing-quote-controller';

/**
 * Stage 5B — free coach-card details, collected in builder state only.
 *
 * Deliberately framework-agnostic (no React, no DOM) so this module can be
 * unit-tested directly in Node, matching src/lib/pricing-quote-controller.ts
 * and src/lib/emblem-uk-builder.ts. src/components/emblem-uk/
 * CoachCardSection.tsx is the thin React wiring around it.
 *
 * This module never reads or writes players/approvedPlayers/paidPlayerCount/
 * totalPrintQuantity — a coach card is a separate entity end to end, never a
 * PlayerDraft, never counted toward pricing. It also never talks to
 * Supabase, S3, or Shopify: photo upload and payload submission are the
 * caller's job (ProductionBuilder.tsx), this module only derives eligibility,
 * available club/team choices, validation, and the final submission shape.
 */

/**
 * One selectable "included club/team" — derived from the order's own
 * *approved* (paid) players, grouped by the same club identity the rest of
 * the builder already groups by (see groupPlayersByClub in
 * ProductionBuilder.tsx). This product has no club/team distinction beyond
 * that single grouping — Official Collection's `player.club` is the real
 * EMJFL club name, Custom Collection's is the customer's own free-text
 * "Club / team name" — so clubName and teamName are deliberately snapshots
 * of the *same* underlying label, not two independently-entered values.
 * order.ageGroup exists on OrderDraft but has no editable UI anywhere in
 * ProductionBuilder.tsx (always ''), so it cannot supply a genuinely
 * distinct "team" value — see the Stage 5B research report for the full
 * reasoning. If a future model gives clubs and teams independent identity
 * (e.g. one club fielding several age-group teams), clubName/teamName
 * should be re-derived from that model instead of this same-label
 * snapshot — migration 0047's two separate columns already anticipate it.
 */
export interface CoachCardTeamOption {
  id: string;
  clubName: string;
  teamName: string;
}

function teamOptionKey(order: OrderDraft, player: PlayerDraft): string {
  if (order.collectionType === 'custom') {
    const club = (player.club || order.club).trim();
    return club ? `custom:${club.toLowerCase()}` : `custom:${player.id}`;
  }
  return player.emjflClubId || order.emjflClubId || 'default';
}

function teamOptionLabel(order: OrderDraft, player: PlayerDraft): string {
  if (order.collectionType === 'custom') return player.club || order.club || 'Custom Collection';
  return player.club || order.club || 'Club';
}

/**
 * Options come only from the order's current *approved* players — matching
 * paidPlayerCount, the same population the authoritative quote prices.
 * A team dropped from the roster (all its players removed/un-approved)
 * simply stops appearing here; reconcileCoachCardTeamSelection uses that to
 * invalidate a stale selection.
 */
export function coachCardTeamOptions(order: OrderDraft): CoachCardTeamOption[] {
  const { approvedPlayers } = summarizeOrder(order);
  const seen = new Map<string, CoachCardTeamOption>();
  for (const player of approvedPlayers) {
    const id = teamOptionKey(order, player);
    if (seen.has(id)) continue;
    const label = teamOptionLabel(order, player);
    seen.set(id, { id, clubName: label, teamName: label });
  }
  return Array.from(seen.values());
}

export type CoachCardRolePreset = 'Coach' | 'Manager' | 'Assistant Coach' | 'Goalkeeping Coach' | 'Other';

export const COACH_CARD_ROLE_PRESETS: CoachCardRolePreset[] = ['Coach', 'Manager', 'Assistant Coach', 'Goalkeeping Coach', 'Other'];

export interface CoachCardPhotoDraft {
  file: File;
  srcUrl: string;
  fileName: string;
}

/**
 * Exactly the fields migration 0047 (order_coach_cards) needs, plus the
 * local photo file/object-URL the existing upload pipeline hasn't turned
 * into a storage key yet. teamOptionId tracks *which* included club/team is
 * selected; clubName/teamName are immutable snapshots taken at selection
 * time (see reconcileCoachCardTeamSelection) — editing the order's club
 * name afterward does not retroactively change an already-selected draft.
 */
export interface CoachCardDraft {
  fullName: string;
  roleTitle: string;
  teamOptionId: string | null;
  clubName: string;
  teamName: string;
  photo: CoachCardPhotoDraft | null;
}

export function emptyCoachCardDraft(): CoachCardDraft {
  return { fullName: '', roleTitle: '', teamOptionId: null, clubName: '', teamName: '', photo: null };
}

/**
 * Runs on every order change (not gated on eligibility — a stale selection
 * should be cleaned up even while the coach-card section is hidden, so the
 * draft is already consistent the moment eligibility returns):
 *  - selection still present among current options -> unchanged
 *  - nothing selected and exactly one option exists -> auto-preselected
 *    (single club/team order; also covers "down to one option" after a
 *    previously multi-team order loses players)
 *  - selection no longer present among current options -> cleared
 */
export function reconcileCoachCardTeamSelection(draft: CoachCardDraft, options: CoachCardTeamOption[]): CoachCardDraft {
  const stillPresent = draft.teamOptionId ? options.find((option) => option.id === draft.teamOptionId) : undefined;
  if (stillPresent) return draft;

  const cleared = draft.teamOptionId ? { ...draft, teamOptionId: null, clubName: '', teamName: '' } : draft;

  if (options.length === 1) {
    const only = options[0];
    return { ...cleared, teamOptionId: only.id, clubName: only.clubName, teamName: only.teamName };
  }

  return cleared;
}

/** Explicit selection — snapshots clubName/teamName from the chosen option. */
export function selectCoachCardTeam(draft: CoachCardDraft, option: CoachCardTeamOption): CoachCardDraft {
  return { ...draft, teamOptionId: option.id, clubName: option.clubName, teamName: option.teamName };
}

export type CoachCardEligibilityReason = 'quote-not-fresh' | 'not-unlocked' | 'invalid-coach-line' | 'eligible';

export interface CoachCardEligibility {
  eligible: boolean;
  reason: CoachCardEligibilityReason;
}

/**
 * The ONLY source of eligibility — a fresh, ready quote (matching the
 * order's current approved-player/print counts, per
 * isQuoteFreshForCounts) whose response reports coachCardIncluded and
 * carries exactly one valid £0 coach_card line. Never derived from
 * order.type or a player-count threshold on the client — see pricing-
 * engine.ts's SQUAD_MIN_PLAYERS, which this module deliberately does not
 * import or duplicate.
 */
export function evaluateCoachCardEligibility(
  quoteState: OrderPricingQuoteState,
  paidPlayerCount: number,
  totalPrintQuantity: number,
): CoachCardEligibility {
  if (quoteState.status !== 'ready' || !isQuoteFreshForCounts(quoteState, paidPlayerCount, totalPrintQuantity)) {
    return { eligible: false, reason: 'quote-not-fresh' };
  }

  const { quote } = quoteState;
  if (!quote.coachCardIncluded) {
    return { eligible: false, reason: 'not-unlocked' };
  }

  const coachLines = quote.lineItems.filter((line) => line.kind === 'coach_card');
  const line = coachLines[0];
  const validLine = coachLines.length === 1 && line.quantity === 1 && line.unitPricePence === 0 && line.subtotalPence === 0;
  if (!validLine) {
    return { eligible: false, reason: 'invalid-coach-line' };
  }

  return { eligible: true, reason: 'eligible' };
}

export interface CoachCardFieldErrors {
  fullName?: string;
  roleTitle?: string;
  team?: string;
  photo?: string;
}

export function validateCoachCardDraft(draft: CoachCardDraft, options: CoachCardTeamOption[]): CoachCardFieldErrors {
  const errors: CoachCardFieldErrors = {};

  if (!draft.fullName.trim()) errors.fullName = "Enter the coach's name.";
  if (!draft.roleTitle.trim()) errors.roleTitle = 'Enter a role or title.';

  const selection = draft.teamOptionId ? options.find((option) => option.id === draft.teamOptionId) : undefined;
  if (!selection || !draft.clubName.trim() || !draft.teamName.trim()) {
    errors.team = 'Select which club/team this coach card is for.';
  }

  if (!draft.photo) errors.photo = "Add the coach's photo.";

  return errors;
}

export function isCoachCardDraftComplete(draft: CoachCardDraft, options: CoachCardTeamOption[]): boolean {
  return Object.keys(validateCoachCardDraft(draft, options)).length === 0;
}

export interface CoachCardDesignInheritance {
  templateId: TemplateId;
  templateName: string;
  /** true when every approved player in the selected club/team shares this
   *  template — the coach card can honestly claim to match. false is a safe
   *  fallback to the order's default design (never persisted, never a
   *  schema field — purely explanatory copy). */
  matchesTeam: boolean;
}

export function coachCardDesignInheritance(order: OrderDraft, teamOptionId: string | null): CoachCardDesignInheritance {
  const { approvedPlayers } = summarizeOrder(order);
  const groupPlayers = teamOptionId ? approvedPlayers.filter((player) => teamOptionKey(order, player) === teamOptionId) : [];
  const templateIds = new Set(groupPlayers.map((player) => selectedTemplate(order, player).id));

  if (groupPlayers.length > 0 && templateIds.size === 1) {
    const template = selectedTemplate(order, groupPlayers[0]);
    return { templateId: template.id, templateName: template.name, matchesTeam: true };
  }

  const fallback = selectedTemplate(order);
  return { templateId: fallback.id, templateName: fallback.name, matchesTeam: false };
}

/** Exactly migration 0047's five customer-supplied text columns, trimmed —
 *  never includes metadata, never an id, never a "persisted" claim. */
export interface CoachCardPayload {
  fullName: string;
  roleTitle: string;
  clubName: string;
  teamName: string;
  photoKey: string;
}

/**
 * Only produces a payload once every field is valid AND a real storage key
 * has been supplied by the caller (photoKey comes from uploading
 * draft.photo through the existing /api/order-assets pipeline at submit
 * time — never a blob:/data: URL, never invented here). Returns null on any
 * gap so a caller can never accidentally send a half-built block.
 */
export function buildCoachCardPayload(draft: CoachCardDraft, options: CoachCardTeamOption[], photoKey: string | null): CoachCardPayload | null {
  if (!photoKey || photoKey.startsWith('blob:') || photoKey.startsWith('data:')) return null;
  if (!isCoachCardDraftComplete(draft, options)) return null;

  return {
    fullName: draft.fullName.trim(),
    roleTitle: draft.roleTitle.trim(),
    clubName: draft.clubName.trim(),
    teamName: draft.teamName.trim(),
    photoKey,
  };
}
