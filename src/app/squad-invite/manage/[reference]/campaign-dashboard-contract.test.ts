import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

const DASHBOARD_ROUTE = 'src/app/api/squad-invites/[id]/dashboard/route.ts';
const DASHBOARD_COMPONENT = 'src/app/squad-invite/manage/[reference]/CampaignDashboard.tsx';
const MANAGE_PAGE = 'src/app/squad-invite/manage/[reference]/page.tsx';

describe('Squad progress — organiser-facing dashboard, bounded club-mediated identifier only', () => {
  it('the dashboard API selects only aggregate campaign fields plus first-name+surname-initial — never a full name, email, photo or guardian identity', () => {
    const source = read(DASHBOARD_ROUTE);
    // The bounded identifier is deliberate (see the component's own
    // comment for why); everything that would go beyond it must never
    // appear — organiser identity of the OTHER party, email, storage
    // keys/photos, or any field not already printed on the card itself.
    expect(source).not.toMatch(/guardian_profile_id\s*[,)]|organiser_name|parent_email|storage_key|storage_url|content_type|email/i);
    expect(source).toContain("select('id,organiser_profile_id,club_team_name,football_age_group,deadline_at,grace_ends_at,campaign_status,payment_phase,fulfilment_status,final_tier,final_unit_price_pence,final_commitment_count,coach_card_eligible')");
    expect(source).toContain(".select('display_first_name,display_surname_initial')");
    expect(source).toContain(".not('display_first_name', 'is', null)");
  });

  it('the dashboard API is ownership-scoped to the signed-in organiser', () => {
    const source = read(DASHBOARD_ROUTE);
    expect(source).toContain('.eq(\'organiser_profile_id\', user.id)');
    expect(source).toContain("if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })");
  });

  it('CampaignDashboard renders the bounded first-name + surname-initial list, never a photo, full surname or contact field', () => {
    const source = read(DASHBOARD_COMPONENT);
    expect(source).toContain('completedCommitments');
    expect(source).toContain('joinedPlayers');
    expect(source).toContain('{p.firstName} {p.surnameInitial}.');
    // The only .map() in this component is over the bounded joinedPlayers
    // list itself — never a richer per-participant object.
    expect(source).not.toMatch(/\.(photoUrl|photo|email|guardianEmail|childName|fullName|surname)\b/);
  });

  it('the manage page only shows the dashboard once the campaign is active, not before', () => {
    const source = read(MANAGE_PAGE);
    expect(source).toMatch(/campaignActive\s*=\s*\w+\?\.campaign_status\s*===\s*'active'/);
    expect(source).toContain('{campaignActive&&r.campaign_id&&<CampaignDashboard campaignId={r.campaign_id}/>}');
  });

  it('Squad progress renders before the status paragraph — ahead of correction and delivery-setup sections', () => {
    // The organiser's most-checked info (live progress) comes first, not
    // buried below a one-time setup form that may already be done.
    const source = read(MANAGE_PAGE);
    const statusLineIndex = source.indexOf('Status: {r.request_status');
    const dashboardIndex = source.indexOf('<CampaignDashboard campaignId={r.campaign_id}/>');
    const correctionIndex = source.indexOf('<CorrectionForm');
    const deliverySetupIndex = source.indexOf('Approved — delivery setup required');
    expect(dashboardIndex).toBeGreaterThan(statusLineIndex);
    expect(dashboardIndex).toBeLessThan(correctionIndex);
    expect(dashboardIndex).toBeLessThan(deliverySetupIndex);
  });

  it('once the campaign is active, the delivery-setup form is replaced by a completion line, not shown alongside it', () => {
    const source = read(MANAGE_PAGE);
    expect(source).toContain('campaignActive?<section');
    expect(source).toContain('Delivery setup complete');
    // DeliverySetup only appears in the false branch of that ternary — the
    // component itself is still imported and used, just not rendered
    // alongside an already-completed setup.
    expect(source.match(/<DeliverySetup reference=\{r\.public_reference\}\/>/g)).toHaveLength(1);
  });

  it('the manage page still gates on the closed pilot flag and organiser ownership, unchanged', () => {
    const source = read(MANAGE_PAGE);
    expect(source).toContain('isSquadInviteMvpEnabled');
    expect(source).toContain('r.organiser_profile_id!==user.id');
  });
});
