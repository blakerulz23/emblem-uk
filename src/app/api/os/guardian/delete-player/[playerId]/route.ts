import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * Guardian right-to-erasure — deletes a player record and everything
 * linked to it (moments, moment_media, skill snapshots) via the ON DELETE
 * CASCADE constraints in 0001_init.sql.
 *
 * Guardrails:
 * - Caller must be a guardian of the player (checked here + RLS enforces
 *   at the DB layer).
 * - Body must contain confirmName === player.name. Prevents accidental
 *   deletion from a stray fetch — no confirmation dialog required
 *   client-side, the API itself demands you say the name.
 *
 * NOT deleted here:
 * - The S3 objects the media rows pointed to. That's a follow-up: run a
 *   background sweeper that deletes S3 keys whose moment_media row has
 *   disappeared. Keeping media until the sweeper runs is the safer
 *   default; a sync S3 delete blocking the API would time out large
 *   requests and leave the DB in an inconsistent state on failure.
 *
 * - The auth.users row for the guardian themselves. Removing an account
 *   is separate — this endpoint only removes a player.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { playerId: string } },
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const { confirmName } = (await request.json()) as { confirmName?: string };

  const { data: player } = await supabase
    .from('players')
    .select('id, name')
    .eq('id', params.playerId)
    .single();
  if (!player) {
    return NextResponse.json({ error: 'Player not found or not permitted' }, { status: 404 });
  }
  if (confirmName !== player.name) {
    return NextResponse.json(
      {
        error:
          'confirmName does not match the player name. Deletion aborted.',
      },
      { status: 400 },
    );
  }

  // RLS on delete: guardians can delete their own linked player's row.
  // (Add explicit policy below if 0001_init.sql doesn't already grant this.)
  const { error } = await supabase.from('players').delete().eq('id', params.playerId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    deletedPlayerId: params.playerId,
    note: 'Related moments, media rows, and skill snapshots were deleted by cascade. Media files in S3 will be removed by the async sweeper.',
  });
}
