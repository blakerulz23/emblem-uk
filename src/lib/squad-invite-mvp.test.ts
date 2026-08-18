import { afterEach, describe, expect, it } from 'vitest';
import { isSquadInviteMvpEnabled, LOCKED_CHILD_BUILDER_CONTRACT } from './squad-invite-mvp';
import { renderSquadInviteEmailPreview } from './squad-invite-email-preview';

describe('Squad Invite MVP closed flag and disabled email previews', () => {
  afterEach(() => { delete process.env.VERCEL_ENV; delete process.env.SQUAD_INVITE_MVP_ENABLED; });
  it('defaults closed, and is a single env-var-controlled switch in every environment including production', () => {
    expect(isSquadInviteMvpEnabled()).toBe(false);
    process.env.SQUAD_INVITE_MVP_ENABLED='true'; expect(isSquadInviteMvpEnabled()).toBe(true);
    process.env.VERCEL_ENV='production'; expect(isSquadInviteMvpEnabled()).toBe(true);
    process.env.SQUAD_INVITE_MVP_ENABLED='false'; expect(isSquadInviteMvpEnabled()).toBe(false);
  });
  it('defines a payment-disabled one-child builder contract', () => {
    expect(LOCKED_CHILD_BUILDER_CONTRACT).toMatchObject({ oneChildOnly:true, paymentEnabled:false, publicProfileEnabled:false, serverOwnershipRequired:true });
  });
  it('renders synthetic disabled emails without parent credentials or child data', () => {
    const rendered=renderSquadInviteEmailPreview('approved_link_ready',{teamName:'Ashton Juniors U10',publicReference:'SI-SYNTHETIC'});
    expect(rendered.deliveryMode).toBe('disabled_test');
    expect(rendered.body).not.toMatch(/token=|child name|delivery address/i);
    expect(rendered.body).toContain('authenticated organiser page');
  });
});
