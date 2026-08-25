import { NextRequest, NextResponse } from 'next/server';
import { issueBuilderSubmissionCapability, BUILDER_SUBMISSION_COOKIE } from '@/lib/builder-submission-capability';
import { consumeAnonymousRequestRateLimit } from '@/lib/anonymous-request-rate-limit';
import { hasValidBuilderCsrf } from '@/lib/builder-request-security';
import { logBuilderAuthorityStage } from '@/lib/builder-authority-diagnostics';

export const runtime = 'nodejs';

/**
 * Issues a new server-side capability for one anonymous, pre-order builder
 * session (Gate 1 residual pass) — the ONLY legitimate way a caller
 * obtains a submissionId that /api/order-assets and /api/render-print will
 * accept. The raw secret is set as an httpOnly cookie and never appears in
 * the JSON response; only the public, non-secret submissionId does.
 */
export async function POST(req: NextRequest) {
  logBuilderAuthorityStage('builder-submissions:received');
  // CSRF fails before anything else — no rate-limit RPC, no DB insert, no
  // token generation for a request that can't prove same-origin + a
  // matching double-submit cookie/header pair.
  if (!hasValidBuilderCsrf(req)) {
    logBuilderAuthorityStage('builder-submissions:csrf-rejected');
    return NextResponse.json({ error: 'Request unavailable' }, { status: 403 });
  }
  if (!(await consumeAnonymousRequestRateLimit(req.headers, 'builder-submission-issue'))) {
    logBuilderAuthorityStage('builder-submissions:rate-limited');
    // Matches the tightest (burst) tier's own window — a caller genuinely
    // rate-limited by the longer rolling/daily tiers still gets a
    // reasonable, if optimistic, suggestion rather than a misleadingly
    // long one computed per-tier (which would itself reveal which tier
    // was hit).
    return NextResponse.json({ error: 'too many requests' }, { status: 429, headers: { 'Retry-After': '60' } });
  }

  try {
    logBuilderAuthorityStage('builder-submissions:issuing');
    const { submissionId, token, expiresAt } = await issueBuilderSubmissionCapability();
    const response = NextResponse.json({ submissionId, expiresAt: expiresAt.toISOString() });
    response.cookies.set(BUILDER_SUBMISSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 60 * 24,
    });
    logBuilderAuthorityStage('builder-submissions:success');
    return response;
  } catch (e: unknown) {
    logBuilderAuthorityStage('builder-submissions:issue-failed');
    console.error('[builder-submissions] issue failed:', e instanceof Error ? e.message : 'unknown error');
    return NextResponse.json({ error: 'could not start a new submission' }, { status: 503 });
  }
}
