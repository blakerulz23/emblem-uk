import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const path = 'supabase/migrations/0053_squad_invite_append_only_history.sql';
const sql = readFileSync(path, 'utf8').toLowerCase();
const functionBody = (name: string) => sql.split(`create or replace function public.${name}`)[1]?.split('alter function')[0] ?? '';

describe('migration 0053 append-only Squad Invite history', () => {
  it('adds positive server-owned request and declaration revisions', () => {
    expect(sql).toContain('add column submission_revision integer not null default 1');
    expect(sql).toContain('set submission_revision = 1 where submission_revision is null');
    expect(sql).toContain('check (submission_revision > 0)');
    expect(sql).toContain('unique (request_id, submission_revision, purpose)');
  });

  it('removes update/delete access and installs trigger guards on both histories', () => {
    for (const table of ['squad_invite_request_declarations', 'squad_invite_request_audit_events']) {
      expect(sql).toContain(`revoke update, delete on public.${table} from public, anon, authenticated, service_role`);
      expect(sql).toMatch(new RegExp(`before update or delete on public\\.${table}`));
    }
    expect(sql).toContain("raise exception 'squad invite review history is append-only'");
    expect(sql).toContain("language plpgsql\nset search_path = ''");
    expect(sql).not.toContain('security definer\nset search_path');
    expect(sql).toContain('revoke all on function public.reject_squad_invite_history_mutation() from public, anon, authenticated, service_role');
  });

  it('creates revision one and exactly four required declarations initially', () => {
    const body = functionBody('submit_squad_invite_request');
    expect(body).toContain('p_fingerprint');
    expect(body).toContain('submission key conflict');
    expect(body).toContain('p_fingerprint,1,now()');
    expect((body.match(/v_request\.id,1,p_profile_id/g) ?? [])).toHaveLength(5);
    expect(body).toContain("'organiser_authority'");
    expect(body).toContain("'delivery_recipient_agreement'");
    expect(body).toContain("'independent_participation'");
    expect(body).toContain("'staff_review_required'");
  });

  it('serialises resubmission and allocates one new revision without upsert', () => {
    const body = functionBody('resubmit_squad_invite_request');
    expect(body).toContain('for update');
    expect(body).toContain("request_status<>'changes_requested'");
    expect(body).toContain('v_next_revision := v_request.submission_revision + 1');
    expect(body).toContain('submission_revision=v_next_revision');
    expect((body.match(/p_request_id,v_next_revision,p_organiser_profile_id/g) ?? [])).toHaveLength(4);
    expect(body).not.toContain('on conflict');
    expect(body).not.toMatch(/update public\.squad_invite_request_(declarations|audit_events)/);
  });

  it('requires all four declaration acceptances on every resubmission', () => {
    const body = functionBody('resubmit_squad_invite_request');
    for (const key of ['authorityAccepted', 'deliveryRecipientAccepted', 'independentParticipationAccepted', 'staffReviewAccepted']) {
      expect(body).toContain(key.toLowerCase());
    }
  });

  it('locks approval and validates only the complete current revision', () => {
    const body = functionBody('approve_squad_invite_request');
    expect(body).toContain('for update');
    expect(body).toContain('submission_revision=v_request.submission_revision');
    expect(body).toContain('if v_declaration_count<>4');
    expect(body).toContain('current submission declarations incomplete');
    expect(body).toContain("'organiser_authority','squad_invite_organiser_authority_v1'");
    expect(body).toContain("'delivery_recipient_agreement','squad_invite_delivery_recipient_v1'");
    expect(body).toContain("'independent_participation','squad_invite_independent_participation_v1'");
    expect(body).toContain("'staff_review_required','squad_invite_staff_review_v1'");
  });

  it('keeps replacement RPCs fixed-search-path, postgres-owned and service-role-only', () => {
    for (const signature of [
      'submit_squad_invite_request(uuid,text,uuid,text,jsonb)',
      'resubmit_squad_invite_request(uuid,uuid,jsonb)',
      'approve_squad_invite_request(uuid,uuid,text)',
    ]) {
      expect(sql).toContain(`alter function public.${signature} owner to postgres`);
      expect(sql).toContain(`grant execute on function public.${signature} to service_role`);
      expect(sql).toContain(`revoke all on function public.${signature} from public`);
    }
    expect((sql.match(/security definer set search_path\s*=\s*''/g) ?? [])).toHaveLength(3);
  });

  it('does not change the reviewed migrations 0050-0052', () => {
    const expected: Record<string, string> = {
      '0050_squad_invite_foundation.sql': '147d2af79b1ea2d1896189cdd88685d44f1c06916b2ae19cb4d2776c4bcbd29b',
      '0051_squad_invite_reusable_links.sql': 'b358501d2582a0f12ce80c0b7a2238776992e56e3c242886d293add0422f1a26',
      '0052_squad_invite_review_foundation.sql': '3cae5dbc6cf62440301d13c30bbb2223930513280c8f8af6c1af93683816b932',
    };
    for (const [file, hash] of Object.entries(expected)) {
      expect(createHash('sha256').update(readFileSync(`supabase/migrations/${file}`)).digest('hex')).toBe(hash);
    }
  });
});
