import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/app/staff/squad-invites/[reference]/page.tsx', 'utf8');

// Guards the fix for a real gap: staff had no way to see where to actually
// ship the consolidated batch of cards — the organiser's real delivery
// address is captured via DeliverySetup.tsx and stored on squad_invites,
// but nothing displayed it. This only reads it; delivery setup itself
// (src/app/squad-invite/manage/[reference]/DeliverySetup.tsx) remains the
// only writer.
describe('Staff request detail — the campaign\'s real delivery address is now visible once provided', () => {
  it('selects the delivery fields from squad_invites, scoped to this campaign, only once a campaign exists', () => {
    expect(source).toContain("r.campaign_id?service.from('squad_invites').select('delivery_address,delivery_postcode,delivery_contact,delivery_instructions').eq('id',r.campaign_id).maybeSingle()");
  });

  it('shows a clear placeholder before delivery setup is complete, never a blank or misleading line', () => {
    expect(source).toContain('Full address not yet provided — organiser has not completed delivery setup.');
    expect(source).not.toContain('Full address deferred.');
  });

  it('renders the full address, postcode, contact and instructions once available', () => {
    expect(source).toContain('Ship to: {campaign.delivery_address}, {campaign.delivery_postcode} · {campaign.delivery_contact}');
    expect(source).toContain('campaign.delivery_instructions?` · ${campaign.delivery_instructions}`:');
  });

  it('this page never writes to squad_invites — read-only, same as every other section here', () => {
    expect(source).not.toMatch(/squad_invites['"]\)\.update\(/);
    expect(source).not.toMatch(/squad_invites['"]\)\.insert\(/);
  });
});
