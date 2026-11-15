import { readFileSync, readdirSync } from 'fs';
import { describe, expect, it } from 'vitest';

/**
 * migration 0105 (Photo Day staff controls), CI-enforced shape. Behaviour
 * is proven against real Postgres in
 * supabase/tests/0104_0105_photo_day_pglite_test.mjs.
 */
const DIR = 'supabase/migrations';
const read = (prefix: string) => {
  const file = readdirSync(DIR).find((f) => f.startsWith(prefix));
  if (!file) throw new Error(`missing migration ${prefix}`);
  return readFileSync(`${DIR}/${file}`, 'utf8');
};
const listAfter = (sql: string, marker: string) => {
  const idx = sql.lastIndexOf(marker);
  return Array.from(sql.slice(idx, sql.indexOf('))', idx)).matchAll(/'([a-z_]+)'/g)).map((m) => m[1]);
};

const sql = read('0105_');
const SIGNATURES = [
  'create_squad_invite_photo_day(uuid, uuid, date, text, text, integer)',
  'confirm_photo_day_coach_permissions(uuid, uuid, text)',
  'issue_photo_day_photographer_link(uuid, uuid, text, integer)',
  'revoke_photo_day_photographer_link(uuid, uuid)',
];
const fn = (name: string) => {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  expect(start, name).toBeGreaterThan(-1);
  return sql.slice(start, sql.indexOf('$$;', start));
};

describe('migration 0105 — Photo Day staff controls', () => {
  const marker = 'add constraint squad_invite_audit_events_event_type_check';
  const allowed = listAfter(sql, marker);

  it('audit event list is a superset of 0104 (never repeats the 0081 regression)', () => {
    for (const e of listAfter(read('0104_'), marker)) expect(allowed).toContain(e);
    expect(allowed).toContain('photo_day_coach_permissions_confirmed');
    expect(allowed).toContain('photo_day_photographer_link_revoked');
  });

  it('every audit event the new functions write is allowed, and each function writes one', () => {
    const inserts = Array.from(sql.matchAll(/insert into public\.squad_invite_audit_events[^;]*?values\s*\(([^;]*?)\);/g));
    expect(inserts.length).toBe(4);
    for (const m of inserts) {
      const events = Array.from(m[1].matchAll(/'(photo_day_[a-z_]+)'/g)).map((x) => x[1]);
      expect(events.length).toBe(1);
      expect(allowed).toContain(events[0]);
    }
  });

  it('every function is security definer, empty search_path, owned by postgres, service_role only', () => {
    for (const sig of SIGNATURES) {
      const name = sig.split('(')[0];
      expect(fn(name)).toMatch(/security definer\s+set search_path = ''/);
      expect(sql).toContain(`alter function public.${sig} owner to postgres;`);
      expect(sql).toContain(`revoke all on function public.${sig} from public, anon, authenticated;`);
      expect(sql).toContain(`grant execute on function public.${sig} to service_role;`);
    }
    expect(sql).not.toMatch(/grant [^;]* to (anon|authenticated)/);
  });

  it('every function checks the caller is staff before anything else', () => {
    for (const sig of SIGNATURES) {
      const body = fn(sig.split('(')[0]);
      const staffCheck = body.indexOf('from public.staff_accounts where profile_id = p_staff_profile_id');
      expect(staffCheck).toBeGreaterThan(-1);
      expect(staffCheck).toBeLessThan(body.indexOf('for update'));
    }
  });

  it('the link stores only a SHA-256 hex hash, is capped at 7 days, and needs coach permission first', () => {
    const issue = fn('issue_photo_day_photographer_link');
    expect(issue).toContain("p_token_hash !~ '^[0-9a-f]{64}$'");
    expect(issue).toContain('p_valid_hours not between 1 and 168');
    expect(issue).toContain('coach_permissions_unconfirmed');
    // The audit row records expiry and replacement, never the hash.
    const audit = issue.slice(issue.indexOf('insert into public.squad_invite_audit_events'));
    expect(audit).not.toContain('p_token_hash');
  });

  it('a photo day must fall on or before the campaign deadline and is deleted at most 60 days after the shoot', () => {
    const create = fn('create_squad_invite_photo_day');
    expect(create).toContain("p_scheduled_for > (v_campaign.deadline_at at time zone 'Europe/London')::date");
    expect(create).toContain('(p_scheduled_for + 60)');
  });
});
