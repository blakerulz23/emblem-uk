export const DISPOSABLE_SQUAD_INVITE_NOTICE =
  'Disposable MVP test · Synthetic data only · No payments · No real child data.';

export const DISPOSABLE_SQUAD_INVITE_HEADERS = {
  'Cache-Control': 'private, no-cache, no-store, max-age=0, must-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
} as const;

export function isDisposableSquadInviteMvpPreview() {
  return (
    process.env.VERCEL_ENV === 'preview' &&
    process.env.SQUAD_INVITE_MVP_ENABLED === 'true' &&
    process.env.SQUAD_INVITE_REVIEW_PREVIEW_ENABLED !== 'true'
  );
}

function isPathFamily(path: string, family: string) {
  return path === family || path.startsWith(`${family}/`);
}

export function isRealSquadInviteUiPath(path: string) {
  return (
    isPathFamily(path, '/squad-invite') ||
    isPathFamily(path, '/staff/squad-invites') ||
    path === '/staff/queue'
  );
}

export function isRealSquadInviteApiPath(path: string) {
  return path.startsWith('/api/squad-invite') || isPathFamily(path, '/api/staff/squad-invites');
}

export function isRealSquadInviteSurfacePath(path: string) {
  return isRealSquadInviteUiPath(path) || isRealSquadInviteApiPath(path);
}
