import { readFileSync, readdirSync } from 'fs';
import { describe, expect, it } from 'vitest';

/**
 * migration 0106 (Photo Day parent consent and publishing), CI-enforced
 * shape. Behaviour is proven against real Postgres in
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
const sql = read('0106_');
const fn = (name: string) => {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  expect(start, name).toBeGreaterThan(-1);
  return sql.slice(start, sql.indexOf('$$;', start));
};
const SIGNATURES = [
  'record_photo_day_consent(uuid, uuid, text, boolean, text, text, integer)',
  'publish_photo_day(uuid, uuid)',
];

describe('migration 0106 — Photo Day parent consent and publishing', () => {
  const marker = 'add constraint squad_invite_audit_events_event_type_check';
  const allowed = listAfter(sql, marker);

  it('audit event list is a superset of 0105', () => {
    for (const e of listAfter(read('0105_'), marker)) expect(allowed).toContain(e);
    for (const e of ['photo_day_consent_granted', 'photo_day_consent_declined', 'photo_day_consent_withdrawn']) expect(allowed).toContain(e);
  });

  it('every audit event written is allowed', () => {
    const inserts = Array.from(sql.matchAll(/insert into public\.squad_invite_audit_events[^;]*?values\s*\(([^;]*?)\);/g));
    expect(inserts.length).toBe(4);
    for (const m of inserts) {
      const events = Array.from(m[1].matchAll(/'(photo_day_[a-z_]+)'/g)).map((x) => x[1]);
      expect(events.length).toBe(1);
      expect(allowed).toContain(events[0]);
    }
  });

  it('both functions are security definer, empty search_path, owned by postgres, service_role only', () => {
    for (const sig of SIGNATURES) {
      expect(fn(sig.split('(')[0])).toMatch(/security definer\s+set search_path = ''/);
      expect(sql).toContain(`alter function public.${sig} owner to postgres;`);
      expect(sql).toContain(`revoke all on function public.${sig} from public, anon, authenticated;`);
      expect(sql).toContain(`grant execute on function public.${sig} to service_role;`);
    }
    expect(sql).not.toMatch(/grant [^;]* to (anon|authenticated)/);
  });

  it('consent proves ownership with guardian AND builder token, like the commit RPC', () => {
    const consent = fn('record_photo_day_consent');
    expect(consent).toContain('and guardian_profile_id = p_guardian_profile_id');
    expect(consent).toContain('and builder_token_hash = p_builder_token_hash');
    expect(consent).toContain("v_participation.status <> 'started'");
  });

  it('a grant is only possible before any upload; withdrawal releases matches and clears the child details', () => {
    const consent = fn('record_photo_day_consent');
    expect(consent).toContain("v_day.status <> 'scheduled'");
    const withdrawBranch = consent.slice(consent.indexOf('-- Decline or withdraw.'));
    expect(withdrawBranch).toContain('public.release_photo_day_photos_for_withdrawn_consent(p_participation_id)');
    expect(withdrawBranch).toContain('display_first_name = null, display_surname_initial = null, squad_number = null');
  });

  it('publish only moves matching to published and kills the photographer link', () => {
    const publish = fn('publish_photo_day');
    expect(publish).toContain("v_day.status <> 'matching'");
    expect(publish).toContain("status = 'published'");
    expect(publish).toContain('photographer_token_hash = null, photographer_token_expires_at = null');
  });
});
