import { describe, expect, it } from 'vitest';
import { isS3NotFoundError } from './s3-client';

describe('isS3NotFoundError', () => {
  it('is true for a 404 status code', () => {
    expect(isS3NotFoundError({ $metadata: { httpStatusCode: 404 } })).toBe(true);
  });

  it('is true for the SDK NotFound error name', () => {
    expect(isS3NotFoundError({ name: 'NotFound' })).toBe(true);
  });

  it('is true for the SDK NoSuchKey error name', () => {
    expect(isS3NotFoundError({ name: 'NoSuchKey' })).toBe(true);
  });

  it('is false for a permission error', () => {
    expect(isS3NotFoundError({ name: 'AccessDenied', $metadata: { httpStatusCode: 403 } })).toBe(false);
  });

  it('is false for a transient server error', () => {
    expect(isS3NotFoundError({ name: 'InternalError', $metadata: { httpStatusCode: 500 } })).toBe(false);
  });

  it('is false for a plain network/timeout error with no S3 shape at all', () => {
    expect(isS3NotFoundError(new Error('ETIMEDOUT'))).toBe(false);
    expect(isS3NotFoundError(new TypeError('fetch failed'))).toBe(false);
  });

  it('is false for null/undefined', () => {
    expect(isS3NotFoundError(null)).toBe(false);
    expect(isS3NotFoundError(undefined)).toBe(false);
  });
});
