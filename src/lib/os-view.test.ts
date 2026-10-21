import { describe, expect, it } from 'vitest';
import { parseOsView, requestedOsView, resolveOsView, validateTeamRequestInput } from './os-view';

describe('resolveOsView — access from relationships, never from profiles.role', () => {
  it('parent only: Parent view, whatever the role says', () => {
    for (const profileRole of [null, 'parent', 'coach'] as const) {
      expect(resolveOsView({ isGuardian: true, isCoach: false, profileRole, requested: null })).toEqual({ view: 'parent', availableViews: ['parent'] });
    }
  });

  it('coach only: Coach view, whatever the role says', () => {
    for (const profileRole of [null, 'parent', 'coach'] as const) {
      expect(resolveOsView({ isGuardian: false, isCoach: true, profileRole, requested: null })).toEqual({ view: 'coach', availableViews: ['coach'] });
    }
  });

  it('neither: no view, even with a role (onboarding decides)', () => {
    for (const profileRole of [null, 'parent', 'coach'] as const) {
      expect(resolveOsView({ isGuardian: false, isCoach: false, profileRole, requested: null })).toEqual({ view: null, availableViews: [] });
    }
  });

  it('a requested view without the relationship is ignored', () => {
    expect(resolveOsView({ isGuardian: true, isCoach: false, profileRole: 'coach', requested: 'coach' }).view).toBe('parent');
    expect(resolveOsView({ isGuardian: false, isCoach: true, profileRole: 'parent', requested: 'parent' }).view).toBe('coach');
    expect(resolveOsView({ isGuardian: false, isCoach: false, profileRole: 'coach', requested: 'coach' }).view).toBeNull();
  });

  it('dual: both views available; the requested one wins', () => {
    expect(resolveOsView({ isGuardian: true, isCoach: true, profileRole: 'parent', requested: 'coach' })).toEqual({ view: 'coach', availableViews: ['parent', 'coach'] });
    expect(resolveOsView({ isGuardian: true, isCoach: true, profileRole: 'coach', requested: 'parent' })).toEqual({ view: 'parent', availableViews: ['parent', 'coach'] });
  });

  it('dual with nothing requested: the role is the preference, parent otherwise', () => {
    expect(resolveOsView({ isGuardian: true, isCoach: true, profileRole: 'coach', requested: null }).view).toBe('coach');
    expect(resolveOsView({ isGuardian: true, isCoach: true, profileRole: 'parent', requested: null }).view).toBe('parent');
    expect(resolveOsView({ isGuardian: true, isCoach: true, profileRole: null, requested: null }).view).toBe('parent');
  });

  it('switching view never removes the other view', () => {
    const toCoach = resolveOsView({ isGuardian: true, isCoach: true, profileRole: 'parent', requested: 'coach' });
    const back = resolveOsView({ isGuardian: true, isCoach: true, profileRole: 'parent', requested: 'parent' });
    expect(toCoach.availableViews).toEqual(['parent', 'coach']);
    expect(back.availableViews).toEqual(['parent', 'coach']);
  });
});

describe('requested view parsing', () => {
  it('accepts only parent/coach; ?view= wins over the cookie', () => {
    expect(parseOsView('coach')).toBe('coach');
    expect(parseOsView('staff')).toBeNull();
    expect(parseOsView(['coach'])).toBeNull();
    expect(requestedOsView('coach', 'parent')).toBe('coach');
    expect(requestedOsView(undefined, 'parent')).toBe('parent');
    expect(requestedOsView('admin', 'nonsense')).toBeNull();
  });
});

describe('validateTeamRequestInput', () => {
  it('trims and accepts a valid request', () => {
    expect(validateTeamRequestInput({ clubName: '  Fictional FC ', teamName: ' U10 ', ageGroup: '', note: ' hi ' })).toEqual({
      ok: true,
      value: { clubName: 'Fictional FC', teamName: 'U10', ageGroup: null, note: 'hi' },
    });
  });

  it('rejects names outside the database limits', () => {
    expect(validateTeamRequestInput({ clubName: 'X', teamName: 'U10' }).ok).toBe(false);
    expect(validateTeamRequestInput({ clubName: 'Fictional FC', teamName: '' }).ok).toBe(false);
    expect(validateTeamRequestInput({ clubName: 'F'.repeat(121), teamName: 'U10' }).ok).toBe(false);
    expect(validateTeamRequestInput({ clubName: 'Fictional FC', teamName: 'U10', ageGroup: 'a'.repeat(41) }).ok).toBe(false);
    expect(validateTeamRequestInput({ clubName: 'Fictional FC', teamName: 'U10', note: 'n'.repeat(1001) }).ok).toBe(false);
    expect(validateTeamRequestInput(null).ok).toBe(false);
  });
});
