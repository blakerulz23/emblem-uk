import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * Every screen of the /os sign-in and onboarding flow must offer a visible
 * way back: these are client-state steps, so the browser Back button leaves
 * /os entirely. Source-level contract, same style as the other *-contract
 * tests in this repo.
 */
const read = (rel: string) => readFileSync(path.join(__dirname, rel), 'utf8');

const SCREENS = [
  'RoleFork.tsx',
  'SignIn.tsx',
  'ClaimCodeEntry.tsx',
  'ClaimConfirm.tsx',
  'VerifyIntendedEmail.tsx',
  'RecoverByEmail.tsx',
  'TeamInviteConfirm.tsx',
  'CoachInviteConfirm.tsx',
  'CreateTeamOnboarding.tsx',
  '../screens/RoleSelect.tsx',
];

describe('sign-in flow back navigation', () => {
  it.each(SCREENS)('%s renders the shared BackLink', (file) => {
    const src = read(file);
    expect(src).toMatch(/import BackLink from '\.{1,2}\/(overlays\/)?BackLink';/);
    expect(src).toContain('<BackLink');
  });

  it('the first screen leads back to the website', () => {
    expect(read('RoleFork.tsx')).toContain('<BackLink href="/" label="Back to site" />');
  });

  it('SignIn goes from the code step back to the email step before leaving', () => {
    const src = read('SignIn.tsx');
    expect(src).toMatch(/step === 'code' \? \(\s*<BackLink\s+onClick=\{\(\) => \{\s*setStep\('email'\);/);
  });

  it('ActivationGate gives every pre-auth screen a previous step', () => {
    const gate = read('ActivationGate.tsx');
    expect(gate).toMatch(/<SignIn\s+onBack=\{/);
    expect(gate).toMatch(/<RecoverByEmail\s+hasSession=\{false\}\s+onBack=\{/);
    expect(gate).toContain("onBack={() => setPreAuthStep('confirm')}");
    // The sign-in screen is only ever opened through openAuthFrom, so Back always knows where to return.
    expect(gate.match(/setPreAuthStep\('auth'\)/g)).toHaveLength(1);
    expect(gate).toContain("openAuthFrom('fork')");
    expect(gate).toContain("openAuthFrom('confirm')");
    expect(gate).toContain("openAuthFrom('verifyEmail')");
    expect(gate).toContain("openAuthFrom('teamInvite')");
    expect(gate).toContain("openAuthFrom('coachInvite')");
  });
});
