import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const routeFiles = [
  'src/app/squad-invite/access/InvitationAccess.tsx',
  'src/app/api/squad-invite-links/exchange/route.ts',
  'src/app/api/squad-invite-links/context/route.ts',
  'src/app/api/squad-invite-links/participation/route.ts',
  'src/app/api/squad-invites/[id]/invitation-link/route.ts',
];
const source = routeFiles.map((file) => readFileSync(file, 'utf8')).join('\n');

describe('Squad Invite link route privacy contract', () => {
  it('does not log credentials or personal information', () => {
    expect(source).not.toMatch(/console\.(log|info|warn|error)/);
    expect(source).not.toMatch(/analytics.*(token|email|name|photo)/i);
  });

  it('uses HttpOnly same-site cookies and never sends the link token to the builder URL', () => {
    expect(source).toContain('httpOnly: true');
    expect(source).toContain("sameSite: 'strict'");
    expect(source).toContain("path: '/'");
    expect(source).toContain('httpOnly: true');
    expect(source).not.toContain('squadInvite=${');
  });

  it('requires authentication before private participation and scopes commit to guardian plus credential', () => {
    expect(source).toContain('Email verification required');
    const commit = readFileSync('src/app/api/squad-invite-participations/[id]/commit/route.ts', 'utf8');
    expect(commit).toContain(".eq('guardian_profile_id', user.id)");
    expect(commit).toContain(".eq('builder_token_hash', hashBuilderToken(token))");
  });

  it('preserves campaign context through new-parent email verification without exposing the link to client code', () => {
    const join = readFileSync('src/app/squad-invite/join/JoinSquadInvite.tsx', 'utf8');
    expect(join).toContain('/api/squad-invite-auth/request-code');
    expect(join).toContain('/api/squad-invite-auth/verify-code');
    expect(join).toContain("await start()");
    expect(join).not.toContain('invitationToken');
  });

  it('returns returning guardians to the same idempotent private participation', () => {
    const participate = readFileSync('src/app/api/squad-invite-links/participation/route.ts', 'utf8');
    expect(participate).toContain('result.created');
    expect(participate).toContain('result.participationId');
    const sql = readFileSync('supabase/migrations/0051_squad_invite_reusable_links.sql', 'utf8');
    expect(sql).toContain("jsonb_build_object('participationId',v_existing,'created',false)");
  });
});
