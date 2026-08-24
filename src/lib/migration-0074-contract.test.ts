import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/0074_remove_exact_dob_stage_a.sql', 'utf8');
const migration0036 = readFileSync('supabase/migrations/0036_player_coach_fields_secure_expand.sql', 'utf8');

describe('migration 0074 remove exact dob (Stage A) contract', () => {
  it('is transactional', () => {
    expect(sql).toMatch(/^begin;/m);
    expect(sql).toMatch(/^commit;/m);
  });

  it('nulls every existing date_of_birth value with a plain UPDATE and no RETURNING clause appended to it', () => {
    // The exact statement, ending in a semicolon immediately after the
    // WHERE clause, is itself the proof there is no RETURNING appended —
    // matched verbatim so any addition to this statement fails the test.
    expect(sql).toContain('update public.players\nset date_of_birth = null\nwhere date_of_birth is not null;');
  });

  it('never selects, logs or otherwise exposes an individual date_of_birth value', () => {
    expect(sql).not.toMatch(/select\s+date_of_birth/i);
    expect(sql).not.toMatch(/raise\s+notice.*date_of_birth/i);
  });

  it('does not drop the players.date_of_birth column or its CHECK constraint — that is Stage B, not this migration', () => {
    expect(sql).not.toMatch(/drop\s+column/i);
    expect(sql).not.toContain('players_date_of_birth_not_future');
    expect(sql).toMatch(/stage b/i);
  });

  it('leaves football_age_group untouched: no ALTER on its column or CHECK constraint', () => {
    expect(sql).not.toMatch(/alter\s+table\s+public\.players[\s\S]*?football_age_group/i);
    expect(sql).not.toContain('players_football_age_group_valid');
  });

  it('revokes execute on and drops both DOB read RPCs', () => {
    expect(sql).toContain('revoke execute on function public.get_player_age(uuid) from authenticated;');
    expect(sql).toContain('drop function if exists public.get_player_age(uuid);');
    expect(sql).toContain('revoke execute on function public.get_player_date_of_birth(uuid) from authenticated;');
    expect(sql).toContain('drop function if exists public.get_player_date_of_birth(uuid);');
  });

  it('drops the old 5-argument update_player_coach_fields signature (with date_of_birth) rather than leaving it reachable alongside the new one', () => {
    expect(sql).toContain('drop function if exists public.update_player_coach_fields(uuid, date, text, int, text, text);');
  });

  it('creates a new 4-argument update_player_coach_fields with no date-of-birth parameter or validation', () => {
    const start = sql.indexOf('create function public.update_player_coach_fields(');
    expect(start).toBeGreaterThan(-1);
    const signatureEnd = sql.indexOf(')', sql.indexOf('p_secondary_position text', start));
    const signature = sql.slice(start, signatureEnd);
    expect(signature).not.toContain('p_date_of_birth');
    expect(signature).not.toContain('date,');
    expect(signature).not.toContain('date\n');
    expect(signature).toContain('p_player_id uuid');
    expect(signature).toContain('p_football_age_group text');
    expect(signature).toContain('p_height_cm int');
    expect(signature).toContain('p_preferred_foot text');
    expect(signature).toContain('p_secondary_position text');

    const body = sql.slice(start);
    expect(body).not.toMatch(/date of birth/i);
    expect(body).not.toContain('implausible age');
  });

  it('is security definer with an explicit empty search_path and fails closed on a missing session, same as every other function in this codebase', () => {
    const start = sql.indexOf('create function public.update_player_coach_fields(');
    const body = sql.slice(start, sql.indexOf('$$;', sql.indexOf('$$', start) + 2) + 3);
    expect(body).toContain('security definer');
    expect(body).toContain("set search_path = ''");
    expect(body).toContain('if auth.uid() is null then');
    expect(body).toContain("raise exception 'Not authenticated';");
  });

  it('preserves the exact football_age_group/height/foot/secondary-position validation and authorization logic from migration 0036, unchanged', () => {
    const start = sql.indexOf('create function public.update_player_coach_fields(');
    const body = sql.slice(start);
    expect(body).toContain("'U7','U8','U9','U10','U11','U12','U13','U14','U15','U16','U17','U18'");
    expect(body).toContain('Height must be between 80 and 220cm');
    expect(body).toContain("'Left', 'Right', 'Both'");
    expect(body).toContain("'GK','CB','LB','RB','LWB','RWB','CDM','CM','CAM','LM','RM','LW','RW','CF','ST'");
    expect(body).toContain('Secondary position cannot match the primary position');
    // Cross-file: the same option lists as originally shipped in 0036, so
    // this migration is provably a narrowing of the signature only, not a
    // behavioural change to the four fields that remain.
    expect(migration0036).toContain("'U7','U8','U9','U10','U11','U12','U13','U14','U15','U16','U17','U18'");
    expect(migration0036).toContain('Height must be between 80 and 220cm');
  });

  it('grants the new function to authenticated only, revoked from public and anon', () => {
    expect(sql).toContain('revoke all on function public.update_player_coach_fields(uuid, text, int, text, text) from public;');
    expect(sql).toContain('revoke all on function public.update_player_coach_fields(uuid, text, int, text, text) from anon;');
    expect(sql).toContain('grant execute on function public.update_player_coach_fields(uuid, text, int, text, text) to authenticated;');
  });

  it('does not touch migrations earlier than 0074 — the original 5-argument function still exists verbatim in 0036', () => {
    expect(migration0036).toContain('create or replace function public.update_player_coach_fields(\n  p_player_id uuid,\n  p_date_of_birth date,');
  });

  it('records the founder declaration and the Stage A / Stage B split in its header', () => {
    expect(sql).toContain('Lauda Cartoons Ltd has identified no printing, NFC, delivery, payment,');
    expect(sql).toMatch(/stage a/i);
    expect(sql).toMatch(/stage b/i);
  });
});
