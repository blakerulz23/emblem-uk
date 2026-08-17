import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

const PRIVACY = 'src/app/privacy/page.tsx';
const TERMS = 'src/app/terms/page.tsx';

// Guards the DPIA's own required-before-pilot item #3: "Replace placeholder
// privacy/terms with layered adult/child notices covering OS, NFC, exact
// DOB, coaches, public sharing, AI, suppliers, retention and rights." This
// doesn't verify legal correctness (that needs a lawyer, per the DPIA's own
// caveat) — only that nobody accidentally reverts these pages to the
// checkout-only placeholder version without the topic coverage this task
// specifically added.
describe('Privacy Policy and Terms — DPIA-required topic coverage stays present', () => {
  it('privacy policy covers Player OS, guardians, coaches and Squad Invite, not just checkout', () => {
    const source = read(PRIVACY);
    expect(source).toContain('Player OS');
    expect(source).toContain('Squad Invite');
    expect(source).toMatch(/coach/i);
    expect(source).toContain('exact date of birth');
  });

  it('privacy policy explains public profile field exclusions explicitly', () => {
    const source = read(PRIVACY);
    expect(source).toMatch(/never[\s\S]{0,80}exact date of birth/i);
    expect(source).toMatch(/never[\s\S]{0,120}assessments/i);
  });

  it('privacy policy names AI processing and offers a non-AI alternative', () => {
    const source = read(PRIVACY);
    expect(source).toMatch(/Gemini|AI[- ]styled/);
    expect(source).toContain('non-AI option');
  });

  it('privacy policy names every current supplier — never silently drops one', () => {
    const source = read(PRIVACY);
    for (const supplier of ['Shopify', 'Supabase', 'Amazon Web Services', 'Vercel', 'Google', 'Resend']) {
      expect(source).toContain(supplier);
    }
  });

  it('privacy policy addresses lost/stolen card handling honestly, including the current limitation', () => {
    const source = read(PRIVACY);
    expect(source).toMatch(/lost or stolen/i);
    expect(source).toContain('being built');
  });

  it('privacy policy states retention proposals are still under review, not final', () => {
    const source = read(PRIVACY);
    expect(source).toMatch(/still under review|indicative, not final/i);
  });

  it('terms cover guardian, coach and Squad Invite organiser responsibilities, not just checkout', () => {
    const source = read(TERMS);
    expect(source).toContain('Guardians and Player OS');
    expect(source).toContain('Coaches');
    expect(source).toContain('Squad Invite organisers');
  });

  it('neither page silently drops the honest company-registration placeholder', () => {
    // Deliberately left as a real unknown, not fabricated — see the pages'
    // own comments. This test guards against someone inventing a company
    // registration number instead of leaving it genuinely marked TBD.
    for (const page of [PRIVACY, TERMS]) {
      expect(read(page)).toMatch(/formal company registration details will be added here once\s+finalised/);
    }
  });
});
