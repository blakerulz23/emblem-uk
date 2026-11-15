import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mockSend = vi.fn();
vi.mock('@aws-sdk/client-s3', () => {
  class Command { constructor(public input: Record<string, unknown>) {} }
  return {
    S3Client: class { send = (cmd: Command) => mockSend(cmd.input); },
    PutObjectCommand: Command, DeleteObjectCommand: Command, HeadObjectCommand: Command,
    CopyObjectCommand: Command, GetObjectCommand: Command, ListObjectsV2Command: Command,
  };
});
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: vi.fn() }));

let listObjectKeys: (prefix: string, maxKeys?: number) => Promise<string[]>;
beforeAll(async () => {
  vi.stubEnv('AWS_S3_BUCKET', 'test-bucket');
  ({ listObjectKeys } = await import('./s3-client'));
});
beforeEach(() => mockSend.mockReset());

describe('listObjectKeys', () => {
  it('refuses anything but a specific folder prefix, before calling S3', async () => {
    for (const bad of ['', '/', 'photo-day/', 'photo-day', 'photo-day/x', '../photo-day/x/', 'photo-day/a/b/']) {
      await expect(listObjectKeys(bad), bad).rejects.toThrow('Refusing to list an unscoped prefix');
    }
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('pages through results under the given prefix only', async () => {
    mockSend
      .mockResolvedValueOnce({ Contents: [{ Key: 'photo-day/d1/a.jpg' }], IsTruncated: true, NextContinuationToken: 't1' })
      .mockResolvedValueOnce({ Contents: [{ Key: 'photo-day/d1/b.jpg' }], IsTruncated: false });
    expect(await listObjectKeys('photo-day/d1/')).toEqual(['photo-day/d1/a.jpg', 'photo-day/d1/b.jpg']);
    expect(mockSend).toHaveBeenNthCalledWith(1, { Bucket: 'test-bucket', Prefix: 'photo-day/d1/', ContinuationToken: undefined });
    expect(mockSend).toHaveBeenNthCalledWith(2, { Bucket: 'test-bucket', Prefix: 'photo-day/d1/', ContinuationToken: 't1' });
  });

  it('stops at maxKeys', async () => {
    mockSend.mockResolvedValue({ Contents: [{ Key: 'photo-day/d1/a.jpg' }, { Key: 'photo-day/d1/b.jpg' }], IsTruncated: true, NextContinuationToken: 'more' });
    expect(await listObjectKeys('photo-day/d1/', 2)).toHaveLength(2);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });
});
