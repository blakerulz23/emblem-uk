import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

const DASHBOARD_ROUTE = 'src/app/api/squad-invites/[id]/dashboard/route.ts';
const DASHBOARD_COMPONENT = 'src/app/squad-invite/manage/[reference]/CampaignDashboard.tsx';
const MANAGE_PAGE = 'src/app/squad-invite/manage/[reference]/page.tsx';

describe('Squad progress — organiser-facing aggregate dashboard, no parent/child PII', () => {
  it('the dashboard API selects only aggregate campaign fields, never a name, email or child detail', () => {
    const source = read(DASHBOARD_ROUTE);
    expect(source).not.toMatch(/organiser_name|guardian|parent_email|child_name|photo|display_first_name|display_surname/i);
    expect(source).toContain("select('id,organiser_profile_id,club_team_name,football_age_group,deadline_at,grace_ends_at,campaign_status,payment_phase,fulfilment_status,final_tier,final_unit_price_pence,final_commitment_count,coach_card_eligible')");
  });

  it('the dashboard API is ownership-scoped to the signed-in organiser', () => {
    const source = read(DASHBOARD_ROUTE);
    expect(source).toContain('.eq(\'organiser_profile_id\', user.id)');
    expect(source).toContain("if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })");
  });

  it('CampaignDashboard renders only a count, never a per-participant field', () => {
    const source = read(DASHBOARD_COMPONENT);
    expect(source).toContain('completedCommitments');
    // No .map() over individual participants and no property access shaped
    // like a per-child/per-guardian field — this component only ever binds
    // to the campaign-level aggregate object, never a list of people.
    expect(source).not.toMatch(/\.map\(/);
    expect(source).not.toMatch(/\.(displayFirstName|displaySurnameInitial|guardianEmail|childName|photoUrl|email)\b/);
    expect(source).toContain('Player names, photos and contact details are never shown here');
  });

  it('the manage page only shows the dashboard once the campaign is active, not before', () => {
    const source = read(MANAGE_PAGE);
    expect(source).toMatch(/campaign_status\s*===\s*'active'\s*&&\s*r\.campaign_id\s*&&\s*<CampaignDashboard campaignId=\{r\.campaign_id\}\/>/);
  });

  it('the manage page still gates on the closed pilot flag and organiser ownership, unchanged', () => {
    const source = read(MANAGE_PAGE);
    expect(source).toContain('isSquadInviteMvpEnabled');
    expect(source).toContain('r.organiser_profile_id!==user.id');
  });
});
