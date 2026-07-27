import type { SupabaseClient } from '@supabase/supabase-js';

export type ResolveSeasonResult =
  | { ok: true; id: string; label: string }
  | { ok: false; status: number; error: string };

const MIN_LABEL_LENGTH = 3;
const MAX_LABEL_LENGTH = 40;

function normalize(label: string): string {
  return label.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Resolves an existing season by normalized label, or creates a new
 * active one if none exists yet. Deliberately narrow: normalization,
 * lookup, create, and race handling only — no authentication or
 * authorization here. Callers (POST /api/os/seasons, the staff approve
 * route) must complete that themselves before calling this, exactly
 * like createGuardianInvite/createTeamInvite don't re-check who's
 * allowed to invite — that's the caller's job.
 *
 * Normalization is deliberately conservative — whitespace and case only,
 * no punctuation stripping — so "2026/27" and "2026-27" stay distinct
 * rather than risk merging two labels that might not mean the same
 * thing in some future, less rigid format.
 */
export async function resolveOrCreateSeason(
  client: SupabaseClient,
  rawLabel: string
): Promise<ResolveSeasonResult> {
  const label = rawLabel.trim().replace(/\s+/g, ' ');
  if (label.length < MIN_LABEL_LENGTH || label.length > MAX_LABEL_LENGTH) {
    return {
      ok: false,
      status: 400,
      error: `Season name must be between ${MIN_LABEL_LENGTH} and ${MAX_LABEL_LENGTH} characters`,
    };
  }
  const normalizedLabel = normalize(label);

  const { data: existing } = await client
    .from('seasons')
    .select('id, label')
    .eq('normalized_label', normalizedLabel)
    .maybeSingle();

  if (existing) {
    return { ok: true, id: existing.id, label: existing.label };
  }

  const { data: created, error } = await client
    .from('seasons')
    .insert({ label, normalized_label: normalizedLabel, status: 'active' })
    .select('id, label')
    .single();

  if (error) {
    // Another request created the same normalized_label between our
    // lookup and insert — the unique constraint caught it. Re-fetch
    // rather than fail; this is a benign race, not an error case.
    if (error.code === '23505') {
      const { data: raced } = await client
        .from('seasons')
        .select('id, label')
        .eq('normalized_label', normalizedLabel)
        .maybeSingle();
      if (raced) return { ok: true, id: raced.id, label: raced.label };
    }
    return { ok: false, status: 500, error: error.message };
  }

  return { ok: true, id: created.id, label: created.label };
}
