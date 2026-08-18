export function isSyntheticSquadInvitePreviewEnabled(): boolean {
  if (process.env.VERCEL_ENV === 'production') return false;
  if (process.env.VERCEL_ENV === 'preview') {
    return process.env.SQUAD_INVITE_REVIEW_PREVIEW_ENABLED === 'true';
  }
  return process.env.NODE_ENV === 'development' && process.env.SQUAD_INVITE_PREVIEW_ENABLED === 'true';
}
