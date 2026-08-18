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

  it('keeps production hard-disabled and introduces no authentication bypass', () => {
    expect(read('src/lib/squad-invite-mvp.ts')).toContain("process.env.VERCEL_ENV === 'production'");
    const changed = [
      read('src/lib/squad-invite-preview-safety.ts'),
      read('src/components/DisposableSquadInviteNotice.tsx'),
      read('src/middleware.ts'),
    ].join('\n');
    expect(changed).not.toMatch(/verifyOtp|signInWithOtp|service.role|createServiceRoleClient/);
  });
});
