import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const PAGE = 'src/app/staff/squad-invites/[reference]/page.tsx';
const FINALISE_BUTTON = 'src/app/staff/squad-invites/[reference]/FinalisePricingButton.tsx';
const read = (path: string) => readFileSync(path, 'utf8');

describe('Staff request detail polish — navigation, sections, readable declarations', () => {
  it('has a clear back link to the queue', () => {
    const source = read(PAGE);
    expect(source).toContain('href="/staff/squad-invites"');
    expect(source).toContain('← Back to Squad Invite queue');
  });

  it('is reorganised into the requested named sections', () => {
    const source = read(PAGE);
    for (const heading of ['Request summary', 'Organiser and delivery details', 'Pricing and campaign progress', 'Technical details']) {
      expect(source).toContain(heading);
    }
  });

  it('translates stored declaration purpose identifiers into readable labels, not raw snake_case', () => {
    const source = read(PAGE);
    expect(source).toContain("organiser_authority: 'Authorised to create this Squad Invite'");
    expect(source).toContain('DECLARATION_PURPOSE_LABEL[x.purpose]');
  });

  it('moves audit history and notification outbox into a collapsed technical-details disclosure', () => {
    const source = read(PAGE);
    const detailsIndex = source.indexOf('<details');
    const auditIndex = source.indexOf('Audit history');
    const outboxIndex = source.indexOf('Notification outbox');
    expect(detailsIndex).toBeGreaterThan(-1);
    expect(auditIndex).toBeGreaterThan(detailsIndex);
    expect(outboxIndex).toBeGreaterThan(detailsIndex);
  });

  it('audit events now show a human-readable timestamp alongside the event type', () => {
    const source = read(PAGE);
    expect(source).toContain("new Date(x.created_at).toLocaleString('en-GB')");
  });

  it('this page is still fully read-only — no mutation call introduced by the reorganisation', () => {
    const source = read(PAGE);
    expect(source).not.toMatch(/\.update\(|\.insert\(|\.rpc\(/);
  });

  it('does not introduce a duplicate <main> landmark', () => {
    const source = read(PAGE);
    expect(source).not.toContain('<main');
  });

  it('stays clear of the fixed-bottom disposable notice on this route', () => {
    const source = read(PAGE);
    expect(source).toContain('pb-28');
  });
});

describe('Finalise pricing — workflow card, display-only availability preview', () => {
  it('shows completed commitments, total participants, paid count and print quantity as separate stats', () => {
    const source = read(FINALISE_BUTTON);
    for (const stat of ['Completed commitments', 'Total participants', 'Paid', 'Print quantity']) expect(source).toContain(stat);
  });

  it('shows deadline and grace-period state', () => {
    const source = read(FINALISE_BUTTON);
    expect(source).toContain('Grace period');
    expect(source).toContain('graceOver');
  });

  it('gives a concise reason when finalisation is not currently available, mirroring the real RPC gate for display only', () => {
    const source = read(FINALISE_BUTTON);
    expect(source).toContain('cancelled or expired and cannot be priced');
    expect(source).toContain('grace period ends');
    expect(source).toContain('No completed commitments yet');
    expect(source).toContain('purely for display');
  });

  it('the button is visually prominent only when the action is actually available', () => {
    const source = read(FINALISE_BUTTON);
    expect(source).toContain("disabled={pending || !available}");
    expect(source).toContain('border-orange-600 bg-orange-600 px-4 py-2 font-bold text-white');
    expect(source).toContain('cursor-not-allowed rounded-xl border-2 border-neutral-300 bg-neutral-100');
  });

  it('every click still calls the real endpoint — the preview never substitutes for server enforcement', () => {
    const source = read(FINALISE_BUTTON);
    expect(source).toContain('/finalise-pricing`, { method: \'POST\' }');
  });

  it('prevents a double submission while a request is in flight', () => {
    const source = read(FINALISE_BUTTON);
    expect(source).toContain('if (pending) return;');
  });
});
