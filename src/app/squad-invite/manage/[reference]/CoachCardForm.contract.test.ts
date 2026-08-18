import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/app/squad-invite/manage/[reference]/CoachCardForm.tsx', 'utf8');
const dashboardSource = readFileSync('src/app/squad-invite/manage/[reference]/CampaignDashboard.tsx', 'utf8');

describe('CoachCardForm — organiser submission, only 3 real fields', () => {
  it('collects exactly name, role and photo — never a design/template choice', () => {
    expect(source).toContain('COACH_CARD_ROLE_PRESETS');
    expect(source).not.toContain("form.set('design'");
    // No <select>/<input> for a template/design choice — only the
    // explanatory header comment mentions "template", never a form control.
    expect(source).not.toMatch(/id="coach-card-(design|template)"/);
  });

  it('submits multipart form data to the new authenticated route, not the open order-assets endpoint', () => {
    expect(source).toContain('/api/squad-invites/${encodeURIComponent(campaignId)}/coach-card');
    expect(source).not.toMatch(/order-assets/);
    expect(source).toContain('new FormData()');
  });

  it('has accessible loading, success and error states with a double-submit guard', () => {
    expect(source).toContain('aria-busy={submitting}');
    expect(source).toContain('role="alert"');
    expect(source).toContain('role="status"');
    expect(source).toContain('if (submitting || !canSubmit || !photo) return;');
  });

  it('is only rendered by CampaignDashboard once the campaign is actually coach-card eligible', () => {
    expect(dashboardSource).toContain('campaign.freeCoachCardConfirmed && csrf');
    expect(dashboardSource).toContain('<CoachCardForm');
  });
});
