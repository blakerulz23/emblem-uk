import { describe, expect, it } from 'vitest';
import { PhotoDayStorageNotConfiguredError, resolvePhotoDayStorageConfig } from './photo-day-storage';

const DEDICATED = {
  PHOTO_DAY_S3_BUCKET: 'emblem-photo-day-prod',
  PHOTO_DAY_AWS_REGION: 'eu-west-2',
  PHOTO_DAY_AWS_ACCESS_KEY_ID: 'AKIAPHOTODAY',
  PHOTO_DAY_AWS_SECRET_ACCESS_KEY: 'secret-pd',
};
const MAIN = { AWS_S3_BUCKET: 'emblem-uk-moments-prod', AWS_REGION: 'eu-west-2', AWS_ACCESS_KEY_ID: 'AKIAMAIN', AWS_SECRET_ACCESS_KEY: 'secret-main' };
const env = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv;

describe('resolvePhotoDayStorageConfig', () => {
  it('uses the dedicated Photo Day bucket and keys when configured, even in production', () => {
    const c = resolvePhotoDayStorageConfig(env({ ...MAIN, ...DEDICATED, VERCEL_ENV: 'production' }));
    expect(c).toEqual({ bucket: 'emblem-photo-day-prod', region: 'eu-west-2', accessKeyId: 'AKIAPHOTODAY', secretAccessKey: 'secret-pd', dedicated: true });
  });

  it('never borrows the main bucket keys for the dedicated bucket', () => {
    const { PHOTO_DAY_AWS_ACCESS_KEY_ID: _id, ...partial } = DEDICATED;
    void _id;
    expect(() => resolvePhotoDayStorageConfig(env({ ...MAIN, ...partial }))).toThrow(PhotoDayStorageNotConfiguredError);
  });

  it('refuses in production when the Photo Day bucket is not set, instead of falling back to the main bucket', () => {
    expect(() => resolvePhotoDayStorageConfig(env({ ...MAIN, VERCEL_ENV: 'production' }))).toThrow(/PHOTO_DAY_S3_BUCKET is not set/);
  });

  it('falls back to the main AWS settings outside production (previews, local dev)', () => {
    const c = resolvePhotoDayStorageConfig(env({ ...MAIN, VERCEL_ENV: 'preview' }));
    expect(c).toEqual({ bucket: 'emblem-uk-moments-prod', region: 'eu-west-2', accessKeyId: 'AKIAMAIN', secretAccessKey: 'secret-main', dedicated: false });
  });

  it('throws when nothing is configured at all', () => {
    expect(() => resolvePhotoDayStorageConfig(env({}))).toThrow(PhotoDayStorageNotConfiguredError);
  });
});
