import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('disposable Squad Invite preview integration contract', () => {
  it('applies central protections through middleware without changing synthetic preview handling', () => {
    const middleware = read('src/middleware.ts');
    expect(middleware).toContain('isRealSquadInviteSurfacePath(path)');
    expect(middleware).toContain('applyDisposableSquadInviteHeaders(response)');
    expect(middleware).toContain('syntheticPreview && isSyntheticSquadInvitePreviewEnabled()');
    expect(middleware).toContain('realSquadInviteSurface && !isSquadInviteMvpEnabled()');
  });

  it('renders one reusable notice only on real UI paths, never in API responses', () => {
    const layout = read('src/app/layout.tsx');
    const chrome = read('src/components/ConditionalChrome.tsx');
    const notice = read('src/components/DisposableSquadInviteNotice.tsx');
    expect(layout).toContain('isDisposableSquadInviteMvpPreview()');
    expect(chrome).toContain('isRealSquadInviteUiPath(pathname)');
    expect(chrome).toContain('<DisposableSquadInviteNotice />');
    expect(notice).toContain("bottom: 0");
    expect(notice).toContain("width: '100%'");
    expect(notice).toContain('safe-area-inset-bottom');
    expect(notice).toContain('role="status"');
    expect(notice).not.toMatch(/supabase|shopify|resend|service.role/i);
    expect(read('src/middleware.ts')).not.toContain('DisposableSquadInviteNotice');
  });

  it('gates production behind the single env-var switch and introduces no authentication bypass', () => {
    // Production is no longer unconditionally hard-disabled in code (that
    // held while the DPIA was an unapproved draft — see the DPIA's
    // 18 August approval note). It's now the same single
    // SQUAD_INVITE_MVP_ENABLED switch as every other environment, so
    // enabling/disabling it again never needs another code change.
    expect(read('src/lib/squad-invite-mvp.ts')).toContain("return process.env.SQUAD_INVITE_MVP_ENABLED === 'true';");
    expect(read('src/lib/squad-invite-mvp.ts')).not.toContain("process.env.VERCEL_ENV === 'production'");
    const changed = [
      read('src/lib/squad-invite-preview-safety.ts'),
      read('src/components/DisposableSquadInviteNotice.tsx'),
      read('src/middleware.ts'),
    ].join('\n');
    expect(changed).not.toMatch(/verifyOtp|signInWithOtp|service.role|createServiceRoleClient/);
  });
});
