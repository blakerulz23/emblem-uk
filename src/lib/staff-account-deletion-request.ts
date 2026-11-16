import type { NextRequest } from 'next/server';
import { hasSafeRequestOrigin } from '@/lib/squad-invite-request-security';

/**
 * Cross-site request checks for the staff account-deletion routes. Staff
 * cookies are SameSite=Lax, but other emblem.cards subdomains count as the
 * same site, and a plain HTML form can post a text/plain body that parses as
 * JSON. So these irreversible routes require the page's own origin and a JSON
 * content type, as the other newer staff routes require the origin.
 */
export function isSafeStaffPost(request: NextRequest): boolean {
  const type = request.headers.get('content-type') ?? '';
  return hasSafeRequestOrigin(request) && type.split(';')[0].trim().toLowerCase() === 'application/json';
}
