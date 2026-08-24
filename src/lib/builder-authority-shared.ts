/**
 * Constants shared between server routes and client builder components for
 * the Adult Permission step (migration 0071). Deliberately has NO imports —
 * builder-authority.ts (its server-side counterpart) imports Node's crypto,
 * which cannot be pulled into a client bundle; anything a client component
 * needs lives here instead, and builder-authority.ts re-exports it so
 * existing server route imports are unaffected.
 */
export const BUILDER_AUTHORITY_DECLARATION_VERSION = 'builder_authority_v1';

export const BUILDER_AUTHORITY_CONFIRMATIONS = {
  ageAndAuthority: 'I confirm that I am 18 or over and authorised to create this card.',
  photoPermission: 'I confirm that I have permission to upload and process this photograph.',
  cardCreation: 'I approve the creation and printing of this personalised card.',
} as const;

export type BuilderAuthorityRelationship = 'parent_guardian' | 'coach' | 'club_organiser' | 'other_adult';
