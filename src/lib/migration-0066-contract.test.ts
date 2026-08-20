import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/0066_squad_invite_early_closure.sql', 'utf8');

describe('migration 0066 Squad Invite early closure contract', () => {
  it('adds campaign_reopened as the one genuinely new event_type — closed/campaign_closed already existed', () => {
    expect(sql).toContain("'campaign_reopened'");
    expect(sql).toContain('drop constraint squad_invite_audit_events_event_type_check');
    expect(sql).toContain('add constraint squad_invite_audit_events_event_type_check');
  });

  describe('close_squad_invite_campaign', () => {
    it('checks ownership itself, not just trusting the caller', () => {
      const fn = sql.slice(sql.indexOf('create or replace function public.close_squad_invite_campaign'), sql.indexOf('create or replace function public.reopen_squad_invite_campaign'));
      expect(fn).toContain('v_campaign.organiser_profile_id <> p_actor_profile_id');
    });

    it('only allows closing from active', () => {
      const fn = sql.slice(sql.indexOf('create or replace function public.close_squad_invite_campaign'), sql.indexOf('create or replace function public.reopen_squad_invite_campaign'));
      expect(fn).toContain("if v_campaign.campaign_status <> 'active' then");
    });

    it('sets campaign_status to closed and records a campaign_closed audit event with the organiser as actor', () => {
      const fn = sql.slice(sql.indexOf('create or replace function public.close_squad_invite_campaign'), sql.indexOf('create or replace function public.reopen_squad_invite_campaign'));
      expect(fn).toContain("set campaign_status = 'closed'");
      expect(fn).toContain("p_actor_profile_id, 'organiser', 'campaign_closed'");
    });

    it('is locked down — security definer, no direct client execute', () => {
      const fn = sql.slice(sql.indexOf('create or replace function public.close_squad_invite_campaign'), sql.indexOf('create or replace function public.reopen_squad_invite_campaign'));
      expect(fn).toContain('security definer');
      expect(sql).toContain('revoke all on function public.close_squad_invite_campaign(uuid, uuid) from public, anon, authenticated');
      expect(sql).toContain('grant execute on function public.close_squad_invite_campaign(uuid, uuid) to service_role');
    });
  });

  describe('reopen_squad_invite_campaign', () => {
    const reopenFn = () => sql.slice(sql.indexOf('create or replace function public.reopen_squad_invite_campaign'), sql.indexOf('-- Lets staff finalise a closed campaign'));

    it('checks ownership itself', () => {
      expect(reopenFn()).toContain('v_campaign.organiser_profile_id <> p_actor_profile_id');
    });

    it('only allows reopening from closed', () => {
      expect(reopenFn()).toContain("if v_campaign.campaign_status <> 'closed' then");
    });

    it('is blocked once pricing has been finalised — the hard, non-negotiable guard', () => {
      expect(reopenFn()).toContain('v_campaign.pricing_finalised_at is not null');
      expect(reopenFn()).toContain("raise exception 'campaign pricing has already been finalised'");
    });

    it('sets campaign_status back to active and records campaign_reopened with the organiser as actor', () => {
      expect(reopenFn()).toContain("set campaign_status = 'active'");
      expect(reopenFn()).toContain("p_actor_profile_id, 'organiser', 'campaign_reopened'");
    });

    it('never touches anything besides campaign_status and the audit trail — no link/order/participation writes', () => {
      const fn = reopenFn();
      expect(fn).not.toContain('squad_invite_links');
      expect(fn).not.toContain('squad_invite_participations');
      expect(fn).not.toContain('public.orders');
    });
  });

  describe('finalise_squad_invite_pricing — grace bypass for closed campaigns', () => {
    const fn = () => sql.slice(sql.indexOf('create or replace function public.finalise_squad_invite_pricing'), sql.indexOf('-- Splits the single generic'));

    it('skips the grace-period wait only when the campaign is closed', () => {
      expect(fn()).toContain("if v_campaign.campaign_status <> 'closed' and now() < v_campaign.grace_ends_at then");
    });

    it('leaves every other branch untouched — idempotent repeat, cancelled/expired guard, eligible-count, tier computation', () => {
      const body = fn();
      expect(body).toContain("if v_campaign.pricing_finalised_at is not null then");
      expect(body).toContain("if v_campaign.campaign_status in ('cancelled','expired') then raise exception 'campaign cannot be priced'; end if;");
      expect(body).toContain('if v_count >= 10 then v_tier := \'squad\'; v_unit := 1899;');
      expect(body).toContain('elsif v_count >= 2 then v_tier := \'multi\'; v_unit := 2199;');
    });
  });

  describe('commit_squad_invite_participation_order — closed gets a distinct message, everything else unchanged', () => {
    const fn = () => sql.slice(sql.indexOf('create or replace function public.commit_squad_invite_participation_order'));

    it('raises a distinct message for a closed campaign, checked before the generic eligibility branch', () => {
      const body = fn();
      const closedIndex = body.indexOf("raise exception 'campaign closed by organiser'");
      const genericAllowListIndex = body.indexOf("campaign_status not in ('active', 'deadline_reached', 'grace_period')");
      expect(closedIndex).toBeGreaterThan(-1);
      expect(genericAllowListIndex).toBeGreaterThan(-1);
      expect(closedIndex).toBeLessThan(genericAllowListIndex);
    });

    it('every other exception message in this function is present, unchanged — proving this is additive, not a rewrite', () => {
      const body = fn();
      const untouchedMessages = [
        "raise exception 'participation unavailable'",
        "raise exception 'commitment unavailable'",
        "raise exception 'invalid submission'",
        "raise exception 'could not generate a unique claim token'",
      ];
      for (const message of untouchedMessages) {
        expect(body).toContain(message);
      }
    });

    it("'closed' was already outside the allow-list before this migration — the block itself is not new, only the message is", () => {
      const body = fn();
      expect(body).toContain("campaign_status not in ('active', 'deadline_reached', 'grace_period')");
    });

    it('the idempotent-retry-before-eligibility-check ordering is unchanged — a repeat call on an already-committed participation still short-circuits before ever reaching the campaign check', () => {
      const body = fn();
      const idempotentIndex = body.indexOf("return jsonb_build_object('created', false");
      const closedCheckIndex = body.indexOf("raise exception 'campaign closed by organiser'");
      expect(idempotentIndex).toBeGreaterThan(-1);
      expect(idempotentIndex).toBeLessThan(closedCheckIndex);
    });
  });
});
