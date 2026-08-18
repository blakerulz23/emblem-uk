import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/0051_squad_invite_reusable_links.sql', 'utf8');

describe('migration 0051 reusable invitation-link contract', () => {
  it('accepts a valid active, unexpired link for an active campaign', () => {
    expect(sql).toContain("v_link.status <> 'active'");
    expect(sql).toContain("v_campaign.campaign_status <> 'active'");
    expect(sql).toContain("'teamName', v_campaign.club_team_name");
  });

  it('separates hashed reusable links from campaigns and participations', () => {
    expect(sql).toContain('create table public.squad_invite_links');
    expect(sql).toContain('campaign_id uuid not null references public.squad_invites');
    expect(sql).toContain("token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$')");
    expect(sql).not.toMatch(/create table public\.squad_invite_links[\s\S]*?\btoken\s+text/i);
  });

  it('supports expiry, pause, revocation, rotation, counts, limits and audit', () => {
    for (const term of ['expires_at','active','paused','revoked','replaced_by_link_id','last_used_at','use_count','participation_limit','squad_invite_link_audit_events']) {
      expect(sql).toContain(term);
    }
  });

  it('returns only the allowlisted safe projection', () => {
    for (const key of ['teamName','ageGroup','deadlineAt','completedCommitments','currentIncentive','deliverySummary','badgeReference','productSummary']) {
      expect(sql).toContain(`'${key}'`);
    }
    const resolveBody = sql.split('create or replace function public.resolve_squad_invite_link')[1].split('create or replace function public.start_squad_invite_participation')[0];
    for (const forbidden of ['delivery_address','purchaser_email','claim_token','display_first_name','photo_key']) expect(resolveBody).not.toContain(forbidden);
    expect(resolveBody).toContain("badge_reference->>'source' = 'official'");
  });

  it('uniformly rejects invalid, expired, revoked, paused and closed links', () => {
    expect(sql).toContain("v_link.status <> 'active'");
    expect(sql).toContain('v_link.expires_at <= now()');
    expect(sql).toContain("v_campaign.campaign_status <> 'active'");
    expect(sql).toContain('v_campaign.deadline_at <= now()');
    expect(sql.match(/return null/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it('makes repeated opens privacy-preserving', () => {
    expect(sql).toContain('use_count = use_count + 1');
    expect(sql).toContain('last_used_at = now()');
    expect(sql).not.toContain('ip_address');
    expect(sql).not.toContain('user_agent');
  });

  it('makes returning-parent participation idempotent and limit checks race-safe', () => {
    expect(sql).toContain('for update');
    expect(sql).toContain('squad_invite_one_guardian_participation_idx');
    expect(sql).toContain("jsonb_build_object('participationId',v_existing,'created',false)");
    expect(sql).toContain('v_count >= v_link.participation_limit');
    expect(sql).toContain('exception when unique_violation');
  });

  it('preserves participations when a link is revoked or replaced', () => {
    const replacement = sql.split('create or replace function public.replace_squad_invite_link')[1];
    expect(replacement).toContain("update public.squad_invite_links set status='revoked'");
    expect(replacement).not.toContain('delete from public.squad_invite_participations');
  });

  it('supports organiser link replacement while rotating the old credential', () => {
    expect(sql).toContain('create or replace function public.replace_squad_invite_link');
    expect(sql).toContain('replaced_by_link_id=v_new_id');
    expect(sql).toContain("event_type,metadata)\n      values(v_old_id,p_campaign_id,p_actor_profile_id,'replaced'");
  });

  it('uses opaque rate-limit buckets and locked-down privileges', () => {
    expect(sql).toContain('create table public.squad_invite_rate_limits');
    expect(sql).toContain('consume_squad_invite_rate_limit');
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain('from public, anon, authenticated');
    expect(sql).not.toMatch(/grant\s+(select|insert|update|delete).*\s+to\s+(anon|authenticated)/i);
  });
});
