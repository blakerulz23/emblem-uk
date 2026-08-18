import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const QUEUE_PAGE = 'src/app/staff/squad-invites/page.tsx';
const read = (path: string) => readFileSync(path, 'utf8');

describe('Staff Squad Invite queue polish — search, sort, interactive cards', () => {
  it('offers a search box scoped to team/organiser/reference/age-group, preserving the current status filter', () => {
    const source = read(QUEUE_PAGE);
    expect(source).toContain('name="q"');
    expect(source).toContain('[r.club_team_name,r.organiser_name,r.public_reference,r.football_age_group]');
    expect(source).toContain('{status&&<input type="hidden" name="status" value={status}/>}');
  });

  it('defaults to newest-first with an oldest-first option, without inventing a new query field', () => {
    const source = read(QUEUE_PAGE);
    expect(source).toContain("const sort=searchParams.sort==='oldest'?'oldest':'newest'");
    expect(source).toContain("order('submitted_at',{ascending:sort==='oldest'})");
    expect(source).toContain('Newest first');
    expect(source).toContain('Oldest first');
  });

  it('separates active work from completed/closed using only already-fetched request_status/campaign_status data, no new query or mutation', () => {
    const source = read(QUEUE_PAGE);
    expect(source).toContain("const CLOSED_CAMPAIGN_STATUSES=new Set(['closed','cancelled','expired']);");
    expect(source).toContain("r.request_status==='rejected'||CLOSED_CAMPAIGN_STATUSES.has(campaign?.campaign_status??'')");
    expect(source).toContain('Completed / closed');
    expect(source).toContain('<details');
  });

  it('status is shown as a labelled badge, never colour alone — the text label always renders regardless of the colour class', () => {
    const source = read(QUEUE_PAGE);
    expect(source).toContain('STATUS_BADGE');
    expect(source).toContain('{r.displayStatus.replaceAll(\'_\',\' \')}');
  });

  it('each queue row is a clearly interactive card with hover and keyboard-focus states and an explicit open affordance', () => {
    const source = read(QUEUE_PAGE);
    expect(source).toContain('hover:border-orange-300');
    expect(source).toContain('focus-visible:outline');
    expect(source).toContain('Open request →');
  });

  it('status filter tabs and sort links preserve the other active query params instead of dropping them', () => {
    const source = read(QUEUE_PAGE);
    expect(source).toContain('function buildHref(');
    expect(source).toContain('buildHref(currentParams,{status:');
    expect(source).toContain('buildHref(currentParams,{sort:');
  });

  it('keeps clear of the fixed-bottom disposable notice on this route (/staff/squad-invites matches isRealSquadInviteUiPath)', () => {
    const source = read(QUEUE_PAGE);
    expect(source).toContain('pb-28');
  });

  it('does not introduce a duplicate <main> landmark — shared chrome already renders one for this route', () => {
    const source = read(QUEUE_PAGE);
    expect(source).not.toContain('<main');
  });
});
