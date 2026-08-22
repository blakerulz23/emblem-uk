import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/0067_squad_invite_payment_mode_live.sql', 'utf8');

describe('migration 0067 Squad Invite payment mode live contract', () => {
  it('flips squad_invite_payment_mode_enabled to true, same signature/grants/security posture as every prior version', () => {
    expect(sql).toContain('as $$ select true; $$;');
    expect(sql).toContain('language sql');
    expect(sql).toContain('stable');
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain('revoke all on function public.squad_invite_payment_mode_enabled() from public, anon, authenticated;');
    expect(sql).toContain('grant execute on function public.squad_invite_payment_mode_enabled() to service_role;');
  });

  it('bumps only the payment_neutral_commitment policy_version to v2 — the purpose string and every other permission row stay unchanged', () => {
    expect(sql).toContain("(v_participation.campaign_id, v_participation.id, 'payment_neutral_commitment', 'squad_invite_commitment_v2', true)");
    expect(sql).toContain("'child_information_authority', 'squad_invite_child_authority_v1', true");
    expect(sql).toContain("'photograph_manufacture', 'squad_invite_photo_manufacture_v1', true");
    expect(sql).toContain("'consolidated_delivery', 'squad_invite_team_delivery_v1', true");
    expect(sql).not.toContain('squad_invite_commitment_v1');
  });

  it('the order-line-item description no longer claims payment is disabled', () => {
    expect(sql).toContain("' - Squad Invite order, price and payment confirmed after the invitation window closes'");
    expect(sql).not.toContain("' - Squad Invite controlled pilot, payment disabled'");
  });

  it('every other branch of commit_squad_invite_participation_order is untouched — idempotent return, closed-campaign message, validation, claim-token loop, audit event', () => {
    const untouched = [
      "raise exception 'participation unavailable'",
      "raise exception 'commitment unavailable'",
      "raise exception 'campaign not eligible'",
      "raise exception 'campaign closed by organiser'",
      "raise exception 'invalid submission'",
      "raise exception 'could not generate a unique claim token'",
      "return jsonb_build_object('created', false",
      "values (v_participation.campaign_id, v_participation.id, 'parent', 'commitment_completed')",
    ];
    for (const marker of untouched) {
      expect(sql).toContain(marker);
    }
  });

  it('reproduces the full commit_squad_invite_participation_order signature and grants unchanged', () => {
    expect(sql).toContain(
      'alter function public.commit_squad_invite_participation_order(uuid,uuid,text,text,text,text,text,integer,text,integer,jsonb,jsonb) owner to postgres;'
    );
    expect(sql).toContain(
      'revoke all on function public.commit_squad_invite_participation_order(uuid,uuid,text,text,text,text,text,integer,text,integer,jsonb,jsonb) from public, anon, authenticated;'
    );
    expect(sql).toContain(
      'grant execute on function public.commit_squad_invite_participation_order(uuid,uuid,text,text,text,text,text,integer,text,integer,jsonb,jsonb) to service_role;'
    );
  });
});
