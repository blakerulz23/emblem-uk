/**
 * Safe, stage-only diagnostic breadcrumbs for the Adult Permission server
 * routes (request-code, verify-code, declare, builder-submissions) —
 * added to trace which awaited stage a request actually reached, without
 * being able to reproduce the reported "stuck Saving…" hang interactively
 * (no browser/preview access in this environment). Never logs a token,
 * email, cookie, submission key, or request body — only a fixed stage
 * label. Silent in production; visible in `vercel logs` for Preview and in
 * local dev, same VERCEL_ENV gate isInternalDevPreviewEnabled() (dev-
 * preview-mode.ts) already uses elsewhere in this codebase.
 */
export function logBuilderAuthorityStage(stage: string): void {
  if (process.env.VERCEL_ENV === 'production') return;
  console.info(`[builder-authority:stage] ${stage}`);
}
