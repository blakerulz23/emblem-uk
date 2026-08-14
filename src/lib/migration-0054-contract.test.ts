import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const migrationPath = 'supabase/migrations/0054_squad_invite_concurrent_submission_idempotency.sql';
const sql = readFileSync(migrationPath, 'utf8').toLowerCase();
const insertAt = sql.indexOf('insert into public.squad_invite_requests');
const loserAt = sql.indexOf('if v_request.id is null', insertAt);
const declarationsAt = sql.indexOf('insert into public.squad_invite_request_declarations', loserAt);

describe('migration 0054 concurrent Squad Invite submission idempotency', () => {
  it('preserves the public signature and service-role-only security boundary', () => {
    const signature = 'submit_squad_invite_request(uuid,text,uuid,text,jsonb)';
    expect(sql).toContain('returns jsonb language plpgsql security definer set search_path = \'\'');
    expect(sql).toContain(`alter function public.${signature} owner to postgres`);
    expect(sql).toContain(`revoke all on function public.${signature} from public`);
    expect(sql).toContain(`revoke all on function public.${signature} from anon`);
    expect(sql).toContain(`revoke all on function public.${signature} from authenticated`);
    expect(sql).toContain(`grant execute on function public.${signature} to service_role`);
  });

  it('handles only the organiser/submission-key race without swallowing other uniqueness failures', () => {
    expect(sql).toContain('on conflict (organiser_profile_id,submission_key) do nothing');
    expect(sql).not.toContain('unique_violation');
    expect(sql).not.toContain('on conflict do nothing');
    expect(sql).not.toContain('exception when');
  });

  it('makes the race loser return the committed winner only for an identical fingerprint', () => {
    const loser = sql.slice(loserAt, declarationsAt);
    expect(loser).toContain('for update');
    expect(loser).toContain('v_existing.submission_fingerprint<>p_fingerprint');
    expect(loser).toContain("raise exception 'submission key conflict'");
    expect(loser).toContain("'created',false");
    expect(loser).toContain("'requestid',v_existing.id");
  });

  it('creates declarations, outbox and audit only on the winning path', () => {
    expect(insertAt).toBeGreaterThan(-1);
    expect(loserAt).toBeGreaterThan(insertAt);
    expect(declarationsAt).toBeGreaterThan(loserAt);
    for (const purpose of ['organiser_authority', 'delivery_recipient_agreement', 'independent_participation', 'staff_review_required']) {
      expect(sql).toContain(`'${purpose}'`);
    }
    expect(sql).toContain('insert into public.squad_invite_notification_outbox');
    expect(sql).toContain('insert into public.squad_invite_request_audit_events');
    expect(sql).not.toMatch(/\b(commit|rollback)\b/);
  });

  it('keeps the route and organiser UI compatible with created true and false', () => {
    const route = readFileSync('src/app/api/squad-invite-requests/route.ts', 'utf8');
    const organiser = readFileSync('src/app/squad-invite/start/OrganiserStart.tsx', 'utf8');
    expect(route).toMatch(/created\?201:200/);
    expect(organiser).toMatch(/created:\s*boolean/);
  });

  it('leaves approved migrations 0050-0053 byte-identical', () => {
    const expected: Record<string, string> = {
      '0050_squad_invite_foundation.sql': '147d2af79b1ea2d1896189cdd88685d44f1c06916b2ae19cb4d2776c4bcbd29b',
      '0051_squad_invite_reusable_links.sql': 'b358501d2582a0f12ce80c0b7a2238776992e56e3c242886d293add0422f1a26',
      '0052_squad_invite_review_foundation.sql': '3cae5dbc6cf62440301d13c30bbb2223930513280c8f8af6c1af93683816b932',
      '0053_squad_invite_append_only_history.sql': '699138fe3086f7f30f52d164c4c7f86ed394b010cfd8cef72f3dfa043c1ece8c',
    };
    for (const [file, hash] of Object.entries(expected)) {
      expect(createHash('sha256').update(readFileSync(`supabase/migrations/${file}`)).digest('hex')).toBe(hash);
    }
  });
});
