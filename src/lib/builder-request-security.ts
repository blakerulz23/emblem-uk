import type { NextRequest } from 'next/server';
import { hasSafeRequestOrigin, hasValidDoubleSubmitCsrf } from './squad-invite-request-security';

/**
 * Reuses Squad Invite's own, already-reviewed double-submit CSRF check
 * (hasValidDoubleSubmitCsrf, extracted from hasValidSquadInviteCsrf) under
 * separate cookie/header names — a distinct cookie because the builder
 * capability flow and Squad Invite are genuinely different sessions with
 * no reason to share one, not a second implementation. The raw token is 32
 * random bytes encoded as unpadded base64url (see src/middleware.ts's
 * ensureBuilderCsrfCookie), set non-httpOnly and sameSite:strict on first
 * legitimate visit to /builder or /test-print.
 */
export const BUILDER_CSRF_COOKIE = 'emblem_builder_csrf';
export const BUILDER_CSRF_HEADER = 'x-emblem-builder-csrf';

export function hasValidBuilderCsrf(request: NextRequest): boolean {
  return hasValidDoubleSubmitCsrf(request, BUILDER_CSRF_COOKIE, BUILDER_CSRF_HEADER);
}

export { hasSafeRequestOrigin };
