/**
 * Gate for internal dev/diagnostic/prototype pages that are not part of the
 * product (test-print, card-setup-preview, the dev/*-test diagnostics, the
 * os prototype folders) — same shape as squad-invite-preview-mode.ts's
 * isSyntheticSquadInvitePreviewEnabled(), deliberately not reused directly
 * since these pages are unrelated to Squad Invite and shouldn't share its
 * env var or its name.
 */
export function isInternalDevPreviewEnabled(): boolean {
  if (process.env.VERCEL_ENV === 'production') return false;
  if (process.env.VERCEL_ENV === 'preview') {
    return process.env.DEV_PREVIEW_ENABLED === 'true';
  }
  return process.env.NODE_ENV === 'development' && process.env.DEV_PREVIEW_ENABLED === 'true';
}
