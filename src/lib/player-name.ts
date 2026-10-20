/**
 * The player's name as it is printed on the card. One limit, shared by the
 * builder inputs, the card's own status check and both server routes that
 * accept a card name (order-enquiry, Squad Invite commit), so a name can
 * never be accepted in one place and rejected — or printed too long — in
 * another.
 *
 * 24 characters keeps every name on one line inside the Custom Collection
 * card back's name area (see customBackNameFontSize in
 * nameplate-typography.ts). Counted in Unicode code points, so "Zoë" is 3,
 * not 4, whichever way the accent was typed. Existing orders are never
 * re-validated; this applies to new submissions only.
 */
export const PLAYER_NAME_MAX_CHARS = 24;

export const PLAYER_NAME_TOO_LONG_MESSAGE = `Player names can be up to ${PLAYER_NAME_MAX_CHARS} characters.`;

export function playerNameLength(name: string | null | undefined): number {
  return Array.from((name ?? '').normalize('NFC').trim()).length;
}

export function playerNameTooLong(name: string | null | undefined): boolean {
  return playerNameLength(name) > PLAYER_NAME_MAX_CHARS;
}
