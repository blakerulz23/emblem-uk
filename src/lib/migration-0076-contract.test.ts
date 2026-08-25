import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/0076_child_data_erasure.sql', 'utf8');

describe('migration 0076 child-data erasure contract', () => {
  it('is transactional', () => {
    expect(sql).toMatch(/^begin;/m);
    expect(sql).toMatch(/^commit;/m);
  });

  it('player_deletion_requests.player_id becomes SET NULL (and nullable), not CASCADE — the request row must outlive the player it names', () => {
    expect(sql).toContain('alter table public.player_deletion_requests alter column player_id drop not null');
    expect(sql).toContain('foreign key (player_id) references public.players(id) on delete set null');
  });

  it('widens cards_access_status_reason_valid additively — every existing value stays allowed', () => {
    expect(sql).toContain("'lost', 'stolen', 'damaged', 'compromised', 'manufacturing_defect', 'other', 'deletion_request'");
  });

  it('every new append/operational table explicitly revokes the default ACL before granting the minimum', () => {
    for (const table of [
      'player_deletion_request_suspended_cards',
      'player_deletion_storage_objects',
      'player_deletion_supplier_status',
      'squad_invite_participation_deletion_storage_objects',
    ]) {
      const idx = sql.indexOf(`create table public.${table}`);
      expect(idx, `${table} should be declared`).toBeGreaterThan(-1);
      const section = sql.slice(idx, idx + 1500);
      expect(section, `${table} should explicitly revoke-all before granting`).toContain(`revoke all on public.${table} from public, anon, authenticated`);
    }
  });

  it('pending_profile_deletions has no client-facing grant at all', () => {
    const idx = sql.indexOf('create table public.pending_profile_deletions');
    const section = sql.slice(idx, idx + 1400);
    expect(section).toContain('revoke all on public.pending_profile_deletions from public, anon, authenticated');
    expect(section).not.toMatch(/grant\s+\w+.*to\s+authenticated/i);
  });

  it('squad_invite_participation_deletion_requests grants guardians only select, via RLS, never insert/update/delete', () => {
    const idx = sql.indexOf('create table public.squad_invite_participation_deletion_requests');
    const section = sql.slice(idx, sql.indexOf('create index idx_squad_invite_participation_deletion_requests'));
    expect(section).toContain('enable row level security');
    expect(section).toContain('grant select on public.squad_invite_participation_deletion_requests to authenticated');
    expect(section).not.toMatch(/grant\s+(?:[\w, ]*\b(insert|delete)\b[\w, ]*)\s+on\s+public\.squad_invite_participation_deletion_requests\s+to\s+authenticated/i);
  });

  const RPCS_STAFF_ONLY = [
    'staff_reject_player_deletion_request',
    'confirm_player_deletion_erasure',
    'finalize_player_deletion_erasure',
    'staff_reject_squad_invite_participation_deletion_request',
    'confirm_squad_invite_participation_erasure',
    'finalize_squad_invite_participation_erasure',
  ];
  const RPCS_GUARDIAN = ['request_player_deletion', 'cancel_own_player_deletion_request', 'request_squad_invite_participation_deletion', 'cancel_own_squad_invite_participation_deletion_request'];
  const RPCS_INTERNAL = ['lockdown_for_player_deletion_request', 'restore_after_player_deletion_request', 'erase_player_and_related_data'];

  it('every client-facing RPC is SECURITY DEFINER with an explicit empty search_path', () => {
    for (const name of [...RPCS_STAFF_ONLY, ...RPCS_GUARDIAN]) {
      const start = sql.indexOf(`create function public.${name}(`) !== -1 ? sql.indexOf(`create function public.${name}(`) : sql.indexOf(`create or replace function public.${name}(`);
      expect(start, `${name} should be declared`).toBeGreaterThan(-1);
      const body = sql.slice(start, start + 1000);
      expect(body).toContain('security definer');
      expect(body).toContain("set search_path = ''");
    }
  });

  it('every staff-only RPC checks staff_accounts, and a completion note where applicable', () => {
    for (const name of RPCS_STAFF_ONLY) {
      const start = sql.indexOf(`create function public.${name}(`);
      const end = sql.indexOf('revoke all on function', start);
      const body = sql.slice(start, end);
      expect(body, `${name} should check staff_accounts`).toContain('staff_accounts');
      expect(body, `${name} should check auth.uid() is null`).toContain('if auth.uid() is null then');
    }
  });

  it('confirm_* RPCs require a non-empty completion note', () => {
    for (const name of ['confirm_player_deletion_erasure', 'confirm_squad_invite_participation_erasure']) {
      const start = sql.indexOf(`create function public.${name}(`);
      const body = sql.slice(start, start + 1500);
      expect(body).toContain('A completion note is required');
    }
  });

  it('internal helper RPCs are never directly grant-exposed to authenticated', () => {
    for (const name of RPCS_INTERNAL) {
      const start = sql.indexOf(`create function public.${name}(`);
      const revokeIdx = sql.indexOf(`revoke all on function public.${name}(`, start);
      expect(revokeIdx, `${name} should have an explicit revoke`).toBeGreaterThan(-1);
      const revokeLine = sql.slice(revokeIdx, sql.indexOf(';', revokeIdx) + 1);
      expect(revokeLine).toContain('authenticated');
      expect(sql).not.toMatch(new RegExp(`grant execute on function public\\.${name}\\([^)]*\\)\\s+to\\s+authenticated`));
    }
  });

  it('lockdown_for_player_deletion_request suspends only active cards, tags them deletion_request, and records exactly which ones', () => {
    const start = sql.indexOf('create function public.lockdown_for_player_deletion_request(');
    const body = sql.slice(start, start + 1400);
    expect(body).toContain("access_status is null");
    expect(body).toContain("public.suspend_card(v_card.id, 'deletion_request')");
    expect(body).toContain('insert into public.player_deletion_request_suspended_cards');
    expect(body).toContain("execution_state = 'awaiting_staff_confirmation'");
  });

  it('lockdown disables public_id_enabled and records whether it was previously enabled', () => {
    const start = sql.indexOf('create function public.lockdown_for_player_deletion_request(');
    const body = sql.slice(start, start + 1400);
    expect(body).toContain('update public.players set public_id_enabled = false');
    expect(body).toContain('exposure_was_enabled = coalesce(v_was_enabled, false)');
  });

  it('restore_after_player_deletion_request only reverses cards still suspended for exactly this reason, and only re-enables sharing this request itself disabled', () => {
    const start = sql.indexOf('create function public.restore_after_player_deletion_request(');
    const body = sql.slice(start, start + 1300);
    expect(body).toContain("v_card.access_status = 'suspended' and v_card.access_status_reason = 'deletion_request'");
    expect(body).toContain('if v_request.exposure_was_enabled then');
  });

  it('request_player_deletion row-locks the player before its idempotent pending-request check (closes the double-file race)', () => {
    const start = sql.indexOf('create or replace function public.request_player_deletion(');
    const body = sql.slice(start, start + 1200);
    const lockIdx = body.indexOf('for update');
    const checkIdx = body.indexOf("status = 'pending'");
    expect(lockIdx).toBeGreaterThan(-1);
    expect(checkIdx).toBeGreaterThan(lockIdx);
  });

  it('cancel_own_player_deletion_request calls the shared restore helper, not a bespoke inline reversal', () => {
    const start = sql.indexOf('create or replace function public.cancel_own_player_deletion_request(');
    const body = sql.slice(start, start + 1400);
    expect(body).toContain('perform public.restore_after_player_deletion_request(v_request_id)');
  });

  it('staff_reject_player_deletion_request also restores, and requires a non-empty rejection reason', () => {
    const start = sql.indexOf('create function public.staff_reject_player_deletion_request(');
    const body = sql.slice(start, start + 1400);
    expect(body).toContain('A rejection reason is required');
    expect(body).toContain('perform public.restore_after_player_deletion_request(p_request_id)');
  });

  it('erase_player_and_related_data revokes every card including replacement-chain cards, strips card_definitions.photo, and deletes the player row last', () => {
    const start = sql.indexOf('create function public.erase_player_and_related_data(');
    const body = sql.slice(start, start + 2200);
    expect(body).toContain('c2.replaced_by_card_id = c1.id');
    expect(body).toContain("public.revoke_card(v_card.id, 'deletion_request')");
    expect(body).toContain('update public.card_definitions set photo = null');
    const deleteMediaIdx = body.indexOf('delete from public.moment_media');
    const deletePlayerIdx = body.indexOf('delete from public.players');
    expect(deleteMediaIdx).toBeGreaterThan(-1);
    expect(deletePlayerIdx).toBeGreaterThan(deleteMediaIdx);
  });

  it('confirm_player_deletion_erasure is idempotent (already-completed short-circuits) and resumable (erasure_started_at guards re-running the DB steps)', () => {
    const start = sql.indexOf('create function public.confirm_player_deletion_erasure(');
    const body = sql.slice(start, start + 2600);
    expect(body).toContain("alreadyCompleted', true");
    expect(body).toContain('v_request.erasure_started_at is not null');
    expect(body).toContain("'resumed', true");
  });

  it('confirm_player_deletion_erasure never accepts a client-supplied storage key — every inventoried key comes from erase_player_and_related_data', () => {
    const start = sql.indexOf('create function public.confirm_player_deletion_erasure(');
    const end = sql.indexOf('revoke all on function public.confirm_player_deletion_erasure');
    const body = sql.slice(start, end);
    expect(body).not.toMatch(/p_completion_note[\s\S]{0,40}s3_key/);
    expect(body).toContain('public.erase_player_and_related_data(v_player_id)');
  });

  it('finalize_player_deletion_erasure never marks completed while any storage object is pending/failed, or any supplier item is unresolved', () => {
    const start = sql.indexOf('create function public.finalize_player_deletion_erasure(');
    const body = sql.slice(start, start + 2200);
    expect(body).toContain("status = 'pending'");
    expect(body).toContain("status = 'failed'");
    expect(body).toMatch(/'unresolved',\s*'request_required',\s*'requested_with_date'/);
    expect(body).toContain("execution_state = 'failed'");
    expect(body).toContain("execution_state = 'awaiting_supplier_action'");
  });

  it('confirm_squad_invite_participation_erasure nulls exactly the child-identifying fields and never deletes the participation row', () => {
    const start = sql.indexOf('create function public.confirm_squad_invite_participation_erasure(');
    const end = sql.indexOf('revoke all on function public.confirm_squad_invite_participation_erasure');
    const body = sql.slice(start, end);
    expect(body).toContain('display_first_name = null');
    expect(body).toContain('display_surname_initial = null');
    expect(body).toContain('squad_number = null');
    expect(body).toContain('child_data_erased_at = now()');
    expect(body).not.toMatch(/delete\s+from\s+public\.squad_invite_participations/i);
  });

  it('confirm_squad_invite_participation_erasure follows the order_id -> cards.player_id link and reuses erase_player_and_related_data for a committed participation', () => {
    const start = sql.indexOf('create function public.confirm_squad_invite_participation_erasure(');
    const end = sql.indexOf('revoke all on function public.confirm_squad_invite_participation_erasure');
    const body = sql.slice(start, end);
    expect(body).toContain('select player_id into v_linked_player_id from public.cards where order_id = v_participation.order_id');
    expect(body).toContain('public.erase_player_and_related_data(v_linked_player_id)');
  });

  it('delete_own_guardian_account handles every profile-referencing FK found in the live catalog, not just the original six', () => {
    const start = sql.indexOf('create or replace function public.delete_own_guardian_account()');
    const body = sql.slice(start);
    for (const ref of [
      'moments set verified_by = null',
      'orders set approved_by = null',
      'team_invites set created_by = null',
      'team_invites set used_by = null',
      'squad_invite_audit_events set actor_profile_id = null',
      'squad_invite_link_audit_events set actor_profile_id = null',
      'squad_invite_notification_outbox set recipient_profile_id = null',
      'squad_invite_participations set guardian_profile_id = null',
      'squad_invite_permissions set actor_profile_id = null',
      'squad_invite_request_audit_events set actor_profile_id = null',
    ]) {
      expect(body, `should null ${ref}`).toContain(ref);
    }
  });

  it('delete_own_guardian_account detects NOT-NULL blockers and defers to pending_profile_deletions instead of erroring or destroying required records', () => {
    const start = sql.indexOf('create or replace function public.delete_own_guardian_account()');
    const body = sql.slice(start);
    expect(body).toContain('coach_authored_player_records');
    expect(body).toContain('squad_invite_organiser_history');
    expect(body).toContain('squad_invite_audit_history');
    expect(body).toContain('insert into public.pending_profile_deletions');
    expect(body).not.toMatch(/delete\s+from\s+public\.squad_invites\b/i);
    expect(body).not.toMatch(/delete\s+from\s+public\.squad_invite_requests\b/i);
    expect(body).toContain("'canDeleteIdentity', not v_blocked");
  });

  it('delete_own_guardian_account only deletes profiles when nothing blocks it', () => {
    const start = sql.indexOf('create or replace function public.delete_own_guardian_account()');
    const body = sql.slice(start);
    expect(body).toMatch(/if v_blocked then[\s\S]*?else[\s\S]*?delete from public\.profiles where id = v_uid;[\s\S]*?end if;/);
  });

  it('sole-guardian auto-filed deletion requests get the same immediate lockdown a guardian-filed request gets', () => {
    const start = sql.indexOf('create or replace function public.delete_own_guardian_account()');
    const body = sql.slice(start);
    expect(body).toContain('perform public.lockdown_for_player_deletion_request(v_request_id, v_player_id)');
  });

  it('does not touch Gemini/background-removal/pricing/Shopify processing logic, or DOB columns', () => {
    // 'google_gemini' appears exactly once, as a supplier-tracking enum
    // label in player_deletion_supplier_status (decision 9) — recording
    // that a child's data went to this supplier is the deletion audit's
    // job, not a change to Gemini itself. No other Gemini/pricing/Shopify
    // term appears anywhere, and this is a SQL migration file — it has no
    // mechanism to alter API-call logic that lives entirely in src/.
    const geminiMatches = sql.toLowerCase().match(/gemini/g) ?? [];
    expect(geminiMatches).toHaveLength(1);
    expect(sql).toContain("'google_gemini'");
    for (const term of ['ai-mockup', 'bgremoval', 'pricing_engine', 'shopify_webhook', 'date_of_birth']) {
      expect(sql.toLowerCase()).not.toContain(term);
    }
  });

  const RPCS_STORAGE_ATTEMPT = ['record_player_deletion_storage_attempt', 'record_squad_invite_deletion_storage_attempt'];

  it('record_*_storage_attempt RPCs are staff-only SECURITY DEFINER with an explicit empty search_path', () => {
    for (const name of RPCS_STORAGE_ATTEMPT) {
      const start = sql.indexOf(`create function public.${name}(`);
      expect(start, `${name} should be declared`).toBeGreaterThan(-1);
      const end = sql.indexOf('revoke all on function', start);
      const body = sql.slice(start, end);
      expect(body).toContain('security definer');
      expect(body).toContain("set search_path = ''");
      expect(body, `${name} should check staff_accounts`).toContain('staff_accounts');
      expect(body, `${name} should check auth.uid() is null`).toContain('if auth.uid() is null then');
    }
  });

  it('record_*_storage_attempt RPCs increment attempts atomically in a single UPDATE, never a client-supplied value', () => {
    for (const name of RPCS_STORAGE_ATTEMPT) {
      const start = sql.indexOf(`create function public.${name}(`);
      const end = sql.indexOf('revoke all on function', start);
      const signature = sql.slice(start, sql.indexOf(')', start) + 1);
      const body = sql.slice(start, end);
      // No p_attempts (or similarly named) parameter — the count can only
      // ever move via the function's own `attempts + 1` expression.
      expect(signature).not.toMatch(/p_attempts/i);
      expect(body).toContain('attempts = attempts + 1');
      // The increment must live inside a single `update ... set` statement
      // with no earlier `select`/`into` of `attempts` in this body — a
      // read-then-write split across two statements is exactly the race
      // this RPC exists to avoid.
      const updateIdx = body.indexOf('update public.');
      const priorSelectOfAttempts = body.slice(0, updateIdx).match(/attempts/);
      expect(priorSelectOfAttempts, `${name} should not read attempts before its atomic update`).toBeNull();
    }
  });

  it('record_*_storage_attempt RPCs grant execute only to authenticated, matching every other client-facing RPC in this migration — not broadened to service_role or public', () => {
    for (const name of RPCS_STORAGE_ATTEMPT) {
      const revokeIdx = sql.indexOf(`revoke all on function public.${name}(`);
      expect(revokeIdx, `${name} should have an explicit revoke`).toBeGreaterThan(-1);
      const revokeLine = sql.slice(revokeIdx, sql.indexOf(';', revokeIdx) + 1);
      expect(revokeLine).toContain('public, anon, authenticated');
      const grantIdx = sql.indexOf(`grant execute on function public.${name}(`);
      const grantLine = sql.slice(grantIdx, sql.indexOf(';', grantIdx) + 1);
      expect(grantLine).toContain('to authenticated');
      expect(grantLine).not.toContain('service_role');
    }
  });

  it('does not modify any migration earlier than 0076', () => {
    for (const earlier of ['0071_builder_order_authority', '0073_restrict_authenticated_card_column_access', '0075_card_lifecycle_controls']) {
      expect(sql).not.toContain(earlier);
    }
    expect(sql).not.toMatch(/drop\s+function\s+public\.suspend_card/i);
    expect(sql).not.toMatch(/drop\s+function\s+public\.revoke_card/i);
  });
});
