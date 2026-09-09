/**
 * The single shared source of the five customer-facing position
 * categories — the card builder, Squad Invite, every card template,
 * Player OS and Coach OS all read this one module rather than each
 * keeping their own copy of the values or the display wording.
 *
 * This is deliberately a *different* concept from Coach OS's existing
 * `secondary_position` (src/app/os/coachFields.ts, players_secondary_
 * position_valid in migration 0036) — that's a coach-owned, 15-code
 * tactical field (GK/CB/LWB/CAM/etc) that already exists precisely to
 * hold detailed/tactical position data separately from a player's
 * simplified primary position, and this change never touches it. The
 * "legacy position" this module maps is the *old builder's* own
 * primary-position dropdown (sportConfig.football.positions before this
 * change: GK/RB/CB/LB/CDM/CM/CAM/RW/LW/ST) — a value that used to live in
 * `players.position`/`card_definitions.position` directly, before this
 * change simplified that field to the five categories below.
 */

export type CanonicalPosition = 'goalkeeper' | 'defender' | 'midfielder' | 'forward' | 'all_rounder';

export const CANONICAL_POSITIONS: CanonicalPosition[] = ['goalkeeper', 'defender', 'midfielder', 'forward', 'all_rounder'];

/** Sentence-case wording — Player OS, Coach OS, the builder's own dropdown
 *  options, anywhere position is discussed in ordinary copy. */
export const POSITION_DISPLAY_LABEL: Record<CanonicalPosition, string> = {
  goalkeeper: 'Goalkeeper',
  defender: 'Defender',
  midfielder: 'Midfielder',
  forward: 'Forward',
  all_rounder: 'All-rounder',
};

/** Full, uppercase wording for card artwork specifically — never an
 *  abbreviation. A separate mapping (not just POSITION_DISPLAY_LABEL run
 *  through .toUpperCase()) because "card label" and "display label" are
 *  conceptually different call sites even though today's values happen to
 *  be case transforms of each other — keeping them separate means a
 *  future divergence (e.g. a shorter card-only variant) never has to
 *  retrofit a shared constant that callers elsewhere also depend on. */
export const POSITION_CARD_LABEL: Record<CanonicalPosition, string> = {
  goalkeeper: 'GOALKEEPER',
  defender: 'DEFENDER',
  midfielder: 'MIDFIELDER',
  forward: 'FORWARD',
  all_rounder: 'ALL-ROUNDER',
};

export const POSITION_OPTIONS: { value: CanonicalPosition; label: string }[] = CANONICAL_POSITIONS.map((value) => ({
  value,
  label: POSITION_DISPLAY_LABEL[value],
}));

/**
 * The old builder dropdown's specific-position codes, safely mapped to
 * their simplified category. Deliberately does not cover every code
 * Coach OS's own secondary-position list supports (LWB/RWB/LM/RM/CF) —
 * those never appeared in the builder's own old position list, so there
 * is no historical `players.position`/`card_definitions.position` row
 * that could ever contain them; adding invented mappings for codes that
 * were never actually selectable here would be guessing, not "safely
 * mapping existing" data.
 */
const LEGACY_BUILDER_POSITION_MAP: Record<string, CanonicalPosition> = {
  GK: 'goalkeeper',
  RB: 'defender',
  CB: 'defender',
  LB: 'defender',
  CDM: 'midfielder',
  CM: 'midfielder',
  CAM: 'midfielder',
  RW: 'forward',
  LW: 'forward',
  ST: 'forward',
};

export function isCanonicalPosition(value: string | null | undefined): value is CanonicalPosition {
  return !!value && (CANONICAL_POSITIONS as string[]).includes(value);
}

/**
 * Resolves any raw stored position value — already-canonical, an old
 * builder specific-position code, or something else entirely (blank,
 * garbled, a value from outside this system) — to one of the five
 * categories, for UI *selection* purposes (pre-selecting a dropdown,
 * deciding what a "friendly" display label should say).
 *
 * Returns null for anything it doesn't safely recognise — callers must
 * never substitute a guess (e.g. defaulting to 'all_rounder') for that
 * null; per the task this came from, an unrecognised value is left
 * unselected/flagged for review, never silently assigned a category.
 */
export function resolveCanonicalPosition(raw: string | null | undefined): CanonicalPosition | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (isCanonicalPosition(trimmed)) return trimmed;
  return LEGACY_BUILDER_POSITION_MAP[trimmed.toUpperCase()] ?? null;
}

/**
 * Friendly display label for any raw stored position value — Player OS,
 * Coach OS, staff views, anywhere position is shown as ordinary text
 * rather than card artwork. A recognised legacy code (e.g. "CB") is shown
 * using its simplified category ("Defender") since these are live,
 * evolving views, not frozen print assets — contrast with
 * positionCardLabel below, which must never do this for an already-
 * approved card. A genuinely unrecognised value is shown as-is rather
 * than hidden, so nothing silently disappears.
 */
export function positionDisplayLabel(raw: string | null | undefined): string {
  const canonical = resolveCanonicalPosition(raw);
  if (canonical) return POSITION_DISPLAY_LABEL[canonical];
  return raw ? raw.trim() : '';
}

/**
 * Full uppercase wording for card artwork. Only ever translates a value
 * that is *exactly* one of the five canonical keys already — it
 * deliberately does NOT run a legacy code like "CB" through
 * LEGACY_BUILDER_POSITION_MAP the way positionDisplayLabel does, because
 * doing so would silently change an already-approved card's visible
 * wording from "CB" to "DEFENDER". card_definitions.position is a frozen
 * per-order copy (never live-linked back to players.position), so a
 * legacy/unrecognised value here always means "an order submitted before
 * this change, or otherwise outside the new five categories" — it is
 * shown exactly as stored (just uppercased, which existing card CSS
 * already does via text-transform regardless) so an old card's artwork
 * is provably unchanged. Only a new or deliberately re-approved
 * submission — whose stored value is genuinely one of the five
 * categories — ever renders the new full-word wording.
 */
export function positionCardLabel(raw: string | null | undefined, fallback = 'POSITION'): string {
  if (!raw) return fallback;
  const trimmed = raw.trim();
  if (isCanonicalPosition(trimmed)) return POSITION_CARD_LABEL[trimmed];
  return trimmed.toUpperCase();
}
