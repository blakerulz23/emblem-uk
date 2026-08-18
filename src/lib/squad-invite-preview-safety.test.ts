import { afterEach, describe, expect, it } from 'vitest';
import {
  DISPOSABLE_SQUAD_INVITE_HEADERS,
  DISPOSABLE_SQUAD_INVITE_NOTICE,
  isDisposableSquadInviteMvpPreview,
  isRealSquadInviteApiPath,
  isRealSquadInviteSurfacePath,
  isRealSquadInviteUiPath,
} from './squad-invite-preview-safety';

describe('disposable Squad Invite MVP preview boundary', () => {
  afterEach(() => {
    delete process.env.VERCEL_ENV;
    delete process.env.SQUAD_INVITE_MVP_ENABLED;
    delete process.env.SQUAD_INVITE_REVIEW_PREVIEW_ENABLED;
  });

  it('requires Vercel Preview, the MVP flag, and disabled synthetic review mode', () => {
    process.env.VERCEL_ENV = 'preview';
    process.env.SQUAD_INVITE_MVP_ENABLED = 'true';
    expect(isDisposableSquadInviteMvpPreview()).toBe(true);
    process.env.SQUAD_INVITE_REVIEW_PREVIEW_ENABLED = 'true';
    expect(isDisposableSquadInviteMvpPreview()).toBe(false);
  });

  it('is false in production regardless of feature flags and false when MVP is disabled', () => {
    process.env.VERCEL_ENV = 'production';
    process.env.SQUAD_INVITE_MVP_ENABLED = 'true';
    expect(isDisposableSquadInviteMvpPreview()).toBe(false);
    process.env.VERCEL_ENV = 'preview';
    process.env.SQUAD_INVITE_MVP_ENABLED = 'false';
    expect(isDisposableSquadInviteMvpPreview()).toBe(false);
  });

  it('defines the exact notice and response protections', () => {
    expect(DISPOSABLE_SQUAD_INVITE_NOTICE).toBe('Disposable MVP test · Synthetic data only · No payments · No real child data.');
    expect(DISPOSABLE_SQUAD_INVITE_HEADERS).toEqual({
      'Cache-Control': 'private, no-cache, no-store, max-age=0, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
    });
  });

  it('scopes every real UI and API family without covering unrelated routes', () => {
    for (const path of ['/squad-invite/start', '/squad-invite/manage/SI-TEST', '/squad-invite/access', '/staff/squad-invites', '/staff/squad-invites/SI-TEST', '/staff/queue']) {
      expect(isRealSquadInviteUiPath(path), path).toBe(true);
      expect(isRealSquadInviteSurfacePath(path), path).toBe(true);
    }
    for (const path of ['/api/squad-invite-auth/request-code', '/api/squad-invite-links/participation', '/api/squad-invite-participations/id/commit', '/api/staff/squad-invites/id/review']) {
      expect(isRealSquadInviteApiPath(path), path).toBe(true);
      expect(isRealSquadInviteSurfacePath(path), path).toBe(true);
    }
    for (const path of ['/', '/pricing', '/builder', '/api/orders/intent', '/staff/login', '/review/squad-invite']) {
      expect(isRealSquadInviteSurfacePath(path), path).toBe(false);
    }
  });
});
