/**
 * PostgREST reports an RLS or privilege refusal as SQLSTATE 42501. Routes use
 * this to answer such a refusal with their own stable 403 message, so the
 * database's text (table, policy and function names) never reaches a client.
 */
export function isPermissionDenied(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === '42501' || /row-level security|permission denied/i.test(error.message ?? '');
}
