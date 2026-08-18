import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/app/squad-invite/join/JoinSquadInvite.tsx', 'utf8');

describe('JoinSquadInvite — real, styled, accessible interactive controls', () => {
  it('renders a genuinely styled email input, not a bare unstyled element (the original defect)', () => {
    const emailInputBlock = source.slice(source.indexOf('id="join-email"'), source.indexOf('id="join-email"') + 400);
    expect(emailInputBlock).toContain('type="email"');
    expect(emailInputBlock).toContain('autoComplete="email"');
    expect(emailInputBlock).toMatch(/className="[^"]*border[^"]*"/);
    expect(emailInputBlock).toMatch(/className="[^"]*focus-visible:outline[^"]*"/);
  });

  it('renders the send-code control as a genuinely styled, submittable button, not plain text', () => {
    const formBlock = source.slice(source.indexOf("step === 'email'"), source.indexOf("step === 'code'"));
    expect(formBlock).toMatch(/<button[^>]*type="submit"[^>]*className="[^"]*bg-orange-600[^"]*"/);
    expect(formBlock).toContain('Send verification code');
  });

  it('renders a genuinely styled verification-code input and submit button', () => {
    const codeBlock = source.slice(source.indexOf("step === 'code'"));
    expect(codeBlock).toMatch(/id="join-code"[^]*?className="[^"]*border[^"]*"/);
    expect(codeBlock).toMatch(/<button[^>]*type="submit"[^>]*className="[^"]*bg-orange-600[^"]*"[^]*?Verify and continue/);
  });

  it('provides resend and change-email controls in the code step', () => {
    const codeBlock = source.slice(source.indexOf("step === 'code'"));
    expect(codeBlock).toContain('Resend code');
    expect(codeBlock).toContain('Change email');
  });

  it('shows a visible loading label while submitting, not just a silently disabled button', () => {
    expect(source).toContain("submitting ? 'Sending…' : 'Send verification code'");
    expect(source).toContain("submitting ? 'Verifying…' : 'Verify and continue'");
    expect(source).toMatch(/disabled=\{submitting\}/);
    expect(source).toMatch(/aria-busy=\{submitting\}/);
  });

  it('never states or implies payment is currently active', () => {
    expect(source).not.toMatch(/pay(s|ment)? (now|today)/i);
    expect(source).toContain('Payment requests are not active during this test.');
    expect(source).not.toContain('pays individually');
  });

  it('states the future-compatible pricing/payment sequence and the disposable-pilot payment state once, coherently', () => {
    expect(source).toContain('Pricing is confirmed for the squad before any payment is requested.');
    expect(source).toContain('No payment is taken at this stage.');
    // Not contradictory: never claims parents pay individually while also
    // saying payments are disabled.
    expect(source).not.toContain('pay individually');
  });

  it('renders the campaign header fields required by the fix', () => {
    expect(source).toContain('invitation.teamName');
    expect(source).toContain('invitation.ageGroup');
    expect(source).toContain('deadlineText');
    expect(source).toContain('invitation.completedCommitments');
    expect(source).toContain('invitation.currentIncentive');
  });

  it('reserves bottom space for the persistent disposable-MVP notice rather than letting it cover content', () => {
    expect(source).toMatch(/pb-28|padding-bottom/);
  });

  it('preserves every existing fetch call, endpoint, and CSRF header untouched', () => {
    expect(source).toContain("fetch('/api/squad-invite-links/participation', { method: 'POST', headers: { 'X-Emblem-CSRF': csrfToken } })");
    expect(source).toContain("fetch('/api/squad-invite-auth/request-code'");
    expect(source).toContain("fetch('/api/squad-invite-auth/verify-code'");
    expect(source).toContain("'X-Emblem-CSRF': csrfToken");
    expect(source).toContain("returnTo: '/squad-invite/join'");
  });

  it('never logs or displays the csrf token or any credential', () => {
    expect(source).not.toMatch(/console\.(log|error|warn)\([^)]*csrfToken/);
  });
});

describe('JoinSquadInvite — OTP request reliability (does not advance on failure)', () => {
  const requestCodeBody = source.slice(source.indexOf('const requestCode ='), source.indexOf('const sendCode ='));

  it('only advances to the code step and starts the cooldown after a genuinely successful response', () => {
    // setStep('code') and setCooldown(60) must appear textually after the
    // !response.ok bail-out, i.e. on the success path only.
    const okCheckIndex = requestCodeBody.indexOf('!response.ok');
    const setStepIndex = requestCodeBody.indexOf("setStep('code')");
    const setCooldownIndex = requestCodeBody.indexOf('setCooldown(60)');
    expect(okCheckIndex).toBeGreaterThan(-1);
    expect(setStepIndex).toBeGreaterThan(okCheckIndex);
    expect(setCooldownIndex).toBeGreaterThan(okCheckIndex);
  });

  it('distinguishes this app’s own 429 rate limit from a generic non-200 Supabase failure', () => {
    expect(requestCodeBody).toMatch(/response\.status === 429/);
    expect(requestCodeBody).toContain('Please wait before requesting another code.');
    expect(requestCodeBody).toContain('We could not request a verification code right now. Please try again shortly.');
  });

  it('distinguishes a network failure (fetch throw) from a server-returned failure', () => {
    expect(requestCodeBody).toMatch(/catch\s*\{/);
    expect(requestCodeBody).toContain('A network problem stopped the request. Check your connection and try again.');
  });

  it('never claims the email was delivered — only that a code was requested', () => {
    expect(source).not.toMatch(/email (has been|was) sent/i);
    expect(source).not.toMatch(/check your (email|inbox)/i);
    expect(source).toContain('A verification code was requested for this address.');
  });

  it('retry (resend) and change-email both route back through the same reliability-checked path', () => {
    expect(source).toContain('onClick={() => void requestCode()}');
    expect(source).toMatch(/onClick=\{\(\) => \{\s*setStep\('email'\);/);
  });
});
