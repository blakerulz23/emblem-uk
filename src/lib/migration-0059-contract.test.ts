import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/0059_squad_invite_coach_card_lifecycle.sql', 'utf8');

describe('migration 0059 Squad Invite coach-card lifecycle contract', () => {
  it('does not touch migrations 0050-0058', () => {
    for (const file of [
      'supabase/migrations/0050_squad_invite_foundation.sql',
      'supabase/migrations/0051_squad_invite_reusable_links.sql',
      'supabase/migrations/0052_squad_invite_review_foundation.sql',
      'supabase/migrations/0053_squad_invite_append_only_history.sql',
      'supabase/migrations/0054_squad_invite_concurrent_submission_idempotency.sql',
      'supabase/migrations/0055_squad_invite_order_commitment.sql',
      'supabase/migrations/0056_squad_invite_organiser_concern_flag.sql',
      'supabase/migrations/0057_squad_invite_payment_request.sql',
      'supabase/migrations/0058_squad_invite_payment_mode_flip.sql',
    ]) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/mark_squad_invite_participation_paid|submit_squad_invite_coach_card|review_squad_invite_coach_card/);
    }
  });

  it('widens the event_type constraint additively — the prior 24 values plus exactly 3 new ones', () => {
    const priorValues = [
      'campaign_created','approval_requested','campaign_approved','campaign_published','invitation_opened',
      'builder_started','commitment_completed','pricing_finalised','payment_request_reissued',
      'payment_confirmed','payment_exception','campaign_closed','campaign_cancelled','coach_card_unlocked',
      'fulfilment_started','fulfilment_transitioned','organiser_reassigned','support_requested','staff_override',
      'delivery_setup_completed','campaign_activated','approval_cancelled','notification_resend_prepared',
      'payment_requested',
    ];
    for (const value of priorValues) expect(sql).toContain(`'${value}'`);
    for (const value of ['coach_card_submitted', 'coach_card_locked', 'coach_card_changes_requested']) expect(sql).toContain(`'${value}'`);
    expect(sql).toContain('drop constraint squad_invite_audit_events_event_type_check');
  });

  it('mark_squad_invite_participation_paid is idempotent and a safe no-op for a non-Squad-Invite order', () => {
    expect(sql).toContain('where order_id = p_order_id for update');
    expect(sql).toContain("return jsonb_build_object('applied', false, 'reason', 'not a squad invite order')");
    expect(sql).toContain("return jsonb_build_object('applied', false, 'reason', 'already paid')");
  });

  it('mark_squad_invite_participation_paid delegates eligibility recompute to the existing reconcile function rather than duplicating its logic', () => {
    const fn = sql.match(/create or replace function public\.mark_squad_invite_participation_paid[\s\S]*?\$\$;/)?.[0] ?? '';
    expect(fn).toContain('public.reconcile_squad_invite_coach_eligibility(v_participation.campaign_id)');
    expect(fn).not.toMatch(/count\(distinct order_id\)/);
  });

  it('only logs coach_card_unlocked on the transition into eligibility, not on every paid participation', () => {
    const fn = sql.match(/create or replace function public\.mark_squad_invite_participation_paid[\s\S]*?\$\$;/)?.[0] ?? '';
    expect(fn).toContain('if v_now_eligible and not coalesce(v_was_eligible, false) then');
  });

  it('records a payment_confirmed audit event for every genuinely-new payment', () => {
    expect(sql).toContain("'payment_confirmed', jsonb_build_object('orderId', p_order_id)");
  });

  it('submit_squad_invite_coach_card derives design server-side — never accepts it as a parameter', () => {
    expect(sql).toContain('create or replace function public.submit_squad_invite_coach_card(p_campaign_id uuid, p_full_name text, p_role_title text, p_photo_key text)');
    expect(sql).not.toContain('p_design');
    expect(sql).toContain("jsonb_build_object('inheritedFrom', 'squad_invite_campaign_default', 'clubTeamName', v_campaign.club_team_name)");
  });

  it('submit_squad_invite_coach_card refuses an ineligible campaign or a locked submission', () => {
    const fn = sql.match(/create or replace function public\.submit_squad_invite_coach_card[\s\S]*?\$\$;/)?.[0] ?? '';
    expect(fn).toContain("if not v_campaign.coach_card_eligible then raise exception 'campaign is not eligible for a coach card'; end if;");
    expect(fn).toContain("if found and v_existing.configuration_status = 'locked' then");
  });

  it('submit_squad_invite_coach_card upserts by campaign_id rather than allowing duplicate rows', () => {
    expect(sql).toContain('on conflict (campaign_id) do update set');
  });

  it('review_squad_invite_coach_card only accepts lock or request_changes, and requires a reason for request_changes', () => {
    const fn = sql.match(/create or replace function public\.review_squad_invite_coach_card[\s\S]*?\$\$;/)?.[0] ?? '';
    expect(fn).toContain("if p_action not in ('lock','request_changes') then raise exception 'invalid action'; end if;");
    expect(fn).toContain("if p_reason is null or char_length(trim(p_reason)) = 0 then raise exception 'a reason is required to request changes'; end if;");
    expect(fn).toContain("configuration_status <> 'submitted' then raise exception");
  });

  it('review_squad_invite_coach_card records the acting staff profile on both outcomes', () => {
    const fn = sql.match(/create or replace function public\.review_squad_invite_coach_card[\s\S]*?\$\$;/)?.[0] ?? '';
    expect((fn.match(/actor_profile_id, actor_role, event_type, metadata\)\s*\n\s*values \(p_campaign_id, p_staff_profile_id/g) ?? []).length).toBe(2);
  });

  it('every new function is locked to service_role only, security definer, empty search_path', () => {
    for (const [name, signature] of [
      ['mark_squad_invite_participation_paid', '(uuid)'],
      ['submit_squad_invite_coach_card', '(uuid,text,text,text)'],
      ['review_squad_invite_coach_card', '(uuid,text,uuid,text)'],
    ]) {
      expect(sql).toContain(`create or replace function public.${name}(`);
      expect(sql).toContain(`alter function public.${name}${signature} owner to postgres`);
      expect(sql).toContain(`revoke all on function public.${name}${signature} from public, anon, authenticated`);
      expect(sql).toContain(`grant execute on function public.${name}${signature} to service_role`);
    }
    expect(sql).toMatch(/\)\nreturns jsonb\nlanguage plpgsql\nsecurity definer\nset search_path = ''/);
  });

  it('is entirely plpgsql function bodies — no explicit commit/rollback/savepoint anywhere', () => {
    expect(sql).not.toMatch(/\bcommit\s*;/i);
    expect(sql).not.toMatch(/\brollback\s*;/i);
    expect(sql).not.toMatch(/\bsavepoint\b/i);
  });
});
