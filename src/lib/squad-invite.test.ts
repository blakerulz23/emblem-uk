import { describe, expect, it } from 'vitest';
import {
  createBuilderToken, effectiveCampaignStatus, hashBuilderToken,
  mayCompleteExistingBuilder, mayStartBuilder, minimalDistributionLabel, paymentDeadline,
} from './squad-invite';

describe('Squad Invite lifecycle and privacy helpers', () => {
  it('uses high-entropy opaque builder tokens and stable hashes', () => {
    const a = createBuilderToken();
    const b = createBuilderToken();
    expect(a.token).not.toBe(b.token);
    expect(a.token.length).toBeGreaterThanOrEqual(40);
    expect(a.hash).toBe(hashBuilderToken(a.token));
    expect(a.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('blocks new starts at deadline but permits existing builders during 24-hour grace', () => {
    const deadline = '2026-09-01T12:00:00.000Z';
    const status = effectiveCampaignStatus('active', deadline, new Date('2026-09-01T13:00:00.000Z'));
    expect(status).toBe('grace_period');
    expect(mayStartBuilder(status)).toBe(false);
    expect(mayCompleteExistingBuilder(status)).toBe(true);
    expect(effectiveCampaignStatus('active', deadline, new Date('2026-09-02T12:00:00.000Z'))).toBe('deadline_reached');
  });

  it('sets exactly a 72-hour payment window', () => {
    expect(paymentDeadline(new Date('2026-09-03T10:00:00Z')).toISOString()).toBe('2026-09-06T10:00:00.000Z');
  });

  it('creates only the approved minimal distribution label', () => {
    expect(minimalDistributionLabel({ firstName: 'Jacob', surnameInitial: 't', squadNumber: 10, packageReference: 'SI-014' }))
      .toBe('Jacob T. — No. 10 — Package SI-014');
    expect(() => minimalDistributionLabel({ firstName: 'Jacob Smith', surnameInitial: 'T', packageReference: 'SI-014' })).toThrow(/exception/);
  });
});
