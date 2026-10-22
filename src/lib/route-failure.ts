/**
 * Reporting a database or trusted-function failure from a route without
 * exposing it. Supabase/PostgreSQL error text (`message`, `details`, `hint`)
 * can name tables, columns, constraints, policies and functions, and can
 * echo values, so it is never returned to a client or logged. A route
 * answers with its own fixed message, and the log carries only a stable
 * operation name and the error's SQLSTATE or PostgREST code.
 */
export type DbError = { code?: string; message?: string; details?: string; hint?: string } | null | undefined;

const SAFE_CODE = /^(?:[0-9A-Z]{5}|PGRST\d{3})$/;

/** The error's SQLSTATE (e.g. 42501) or PostgREST code (e.g. PGRST116), or 'unknown'. */
export function safeErrorCode(error: DbError): string {
  const code = error?.code;
  return typeof code === 'string' && SAFE_CODE.test(code) ? code : 'unknown';
}

/** Logs `<operation> failed` with the safe code only. `operation` must be a fixed string. */
export function logRouteFailure(operation: string, error?: DbError): void {
  console.error(`${operation} failed`, { code: safeErrorCode(error) });
}

/**
 * True when a trusted function raised a known message containing
 * `fragment`. Used only to choose a fixed response; the message itself is
 * never returned or logged.
 */
export function raised(error: DbError, fragment: string): boolean {
  return typeof error?.message === 'string' && error.message.includes(fragment);
}
