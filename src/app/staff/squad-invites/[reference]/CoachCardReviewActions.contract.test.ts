import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/app/staff/squad-invites/[reference]/CoachCardReviewActions.tsx', 'utf8');
const pageSource = readFileSync('src/app/staff/squad-invites/[reference]/page.tsx', 'utf8');

describe('CoachCardReviewActions — lock is the irreversible action, request_changes is the safe one', () => {
  it('confirms before locking, since review_squad_invite_coach_card refuses to run again once locked', () => {
    expect(source).toContain("action === 'lock' && !window.confirm(");
    expect(source).not.toContain("action === 'request_changes' && !window.confirm(");
  });

  it('requires a reason before allowing request_changes', () => {
    expect(source).toContain("action === 'request_changes' && reason.trim().length === 0");
  });

  it('prevents a double submission while a request is in flight', () => {
    expect(source).toContain('if (pending) return;');
  });

  it('posts to the staff coach-card review route, not the organiser-facing one', () => {
    expect(source).toContain('/api/staff/squad-invites/${encodeURIComponent(campaignId)}/coach-card/review');
  });

  it('is only rendered on the staff detail page once a coach card is actually awaiting review', () => {
    expect(pageSource).toContain("coachCard.configuration_status==='submitted'&&<CoachCardReviewActions");
  });
});
