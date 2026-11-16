import { readFileSync, readdirSync } from 'fs';
import { describe, expect, it } from 'vitest';

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

const sql = read('0104_');
const fn = (name: string) => {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  expect(start, name).toBeGreaterThan(-1);
  return sql.slice(start, sql.indexOf('$$;', start));
};

describe('migration 0104 — Photo Day foundation', () => {
  it('keeps every existing consent purpose and adds photo_day_photography', () => {
    const before = listAfter(read('0050_'), 'purpose text not null check (purpose in (');
    const after = listAfter(sql, 'add constraint squad_invite_permissions_purpose_check');
    expect(before.length).toBe(6);
    for (const p of before) expect(after).toContain(p);
    expect(after).toContain('photo_day_photography');
  });

  it('audit event list is a superset of 0103 (does not repeat the 0081 regression)', () => {
    const marker = 'add constraint squad_invite_audit_events_event_type_check';
    const prev = listAfter(read('0103_'), marker);
    const next = listAfter(sql, marker);
    for (const e of prev) expect(next).toContain(e);
    for (const e of ['photo_day_photo_uploaded', 'photo_day_photo_matched', 'photo_day_photo_unmatched']) {
      expect(next).toContain(e);
    }
  });

  it('every audit event the new functions write is allowed', () => {
    const allowed = listAfter(sql, 'add constraint squad_invite_audit_events_event_type_check');
    const inserts = Array.from(sql.matchAll(/insert into public\.squad_invite_audit_events[^;]*?values\s*\(([^;]*?)\);/g));
    expect(inserts.length).toBe(3);
    for (const m of inserts) {
      const events = Array.from(m[1].matchAll(/'(photo_day_[a-z_]+)'/g)).map((x) => x[1]);
      expect(events.length).toBe(1);
      expect(allowed).toContain(events[0]);
    }
  });

  it('new tables are RLS-enabled and unreachable by anon/authenticated', () => {
    for (const t of ['squad_invite_photo_days', 'squad_invite_photo_day_photos']) {
      expect(sql).toContain(`alter table public.${t} enable row level security;`);
    }
    expect(sql).toMatch(/revoke all on public\.squad_invite_photo_days, public\.squad_invite_photo_day_photos\s+from public, anon, authenticated;/);
    expect(sql).not.toMatch(/grant [^;]* to (anon|authenticated)/);
  });

  it('every function is security definer with an empty search_path, owned by postgres, service_role only', () => {
    for (const name of ['record_photo_day_photo', 'match_photo_day_photo', 'unmatch_photo_day_photo', 'release_photo_day_photos_for_withdrawn_consent']) {
      const body = fn(name);
      expect(body).toContain('security definer');
      expect(body).toContain("set search_path = ''");
      expect(sql).toMatch(new RegExp(`alter function public\\.${name}\\([^)]*\\) owner to postgres;`));
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon, authenticated;`));
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${name}\\([^)]*\\) to service_role;`));
    }
  });

  it('matching requires an unwithdrawn photo_day_photography grant for that participation in that campaign', () => {
    const body = fn('match_photo_day_photo');
    expect(body).toContain("purpose = 'photo_day_photography'");
    expect(body).toContain('granted = true');
    expect(body).toContain('withdrawn_at is null');
    expect(body).toContain('participation_id = p_participation_id');
    expect(body).toContain('campaign_id = v_day.campaign_id');
    expect(body).toContain("v_participation.status <> 'started'");
    expect(body).toMatch(/from public\.staff_accounts where profile_id = p_staff_profile_id/);
  });

  it('photographer upload checks token hash, expiry, status, coach permission, key prefix and cap', () => {
    const body = fn('record_photo_day_photo');
    expect(body).toContain('photographer_token_hash is distinct from p_token_hash');
    expect(body).toContain('photographer_token_expires_at <= now()');
    expect(body).toContain("status not in ('scheduled','shooting')");
    expect(body).toContain('coach_permissions_confirmed_at is null');
    expect(body).toContain("'photo-day/' || p_photo_day_id::text || '/%'");
    expect(body).toContain('v_count >= v_day.max_photos');
  });

  it('withdrawing consent releases that child\'s matched photos', () => {
    const body = fn('release_photo_day_photos_for_withdrawn_consent');
    expect(body).toContain('participation_id = null');
    expect(body).toContain("purpose = 'photo_day_photography'");
  });

  it('stores only a token hash and a delete-by date for every photo day', () => {
    expect(sql).toContain("photographer_token_hash text unique check (photographer_token_hash ~ '^[0-9a-f]{64}$')");
    expect(sql).toContain('photos_delete_after timestamptz not null');
    expect(sql).not.toMatch(/photographer_token text/);
  });

  it('does not edit any earlier migration', () => {
    for (const f of readdirSync(DIR).filter((x) => x < '0104')) {
      expect(readFileSync(`${DIR}/${f}`, 'utf8')).not.toContain('photo_day');
    }
  });
});
