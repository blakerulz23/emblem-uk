import { timingSafeEqual } from 'crypto';
import type { NextRequest } from 'next/server';

export const SQUAD_INVITE_CSRF_COOKIE = 'emblem_squad_csrf';
export const SQUAD_INVITE_CSRF_HEADER = 'x-emblem-csrf';

export function hasSquadInviteContextCookie(request: NextRequest): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(request.cookies.get('emblem_squad_invite_link')?.value ?? '');
}

export function hasSafeRequestOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

export function hasValidSquadInviteCsrf(request: NextRequest): boolean {
  if (!hasSafeRequestOrigin(request)) return false;
  const cookieToken = request.cookies.get(SQUAD_INVITE_CSRF_COOKIE)?.value ?? '';
  const headerToken = request.headers.get(SQUAD_INVITE_CSRF_HEADER) ?? '';
  if (!/^[A-Za-z0-9_-]{43}$/.test(cookieToken) || cookieToken.length !== headerToken.length) return false;
  return timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken));
}

export function safeSquadInviteReturnPath(value: unknown): '/squad-invite/join' {
  return value === '/squad-invite/join' ? value : '/squad-invite/join';
}
