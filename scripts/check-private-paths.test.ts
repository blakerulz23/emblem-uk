import { describe, expect, it } from 'vitest';
import { checkRepository, findPrivatePaths, SELF } from './check-private-paths.mjs';

describe('no machine-specific or private paths are committed', () => {
  it('the tracked text files of this repository are clean', () => {
    expect(checkRepository(process.cwd(), { exclude: SELF })).toEqual([]);
  });

  it('flags a Windows user directory, with single or doubled backslashes', () => {
    expect(findPrivatePaths(String.raw`$env:X = 'C:\Users\someone\Desktop\tooling'`)).toContain('Windows user directory');
    expect(findPrivatePaths(String.raw`"D:\\Users\\someone\\x"`)).toContain('Windows user directory');
  });

  it('flags macOS/Linux home directories, but not asset URLs that contain /home/', () => {
    expect(findPrivatePaths(`cd /Users/someone/project`)).toContain('macOS or Linux home directory');
    expect(findPrivatePaths(`export X=/home/someone/tooling`)).toContain('macOS or Linux home directory');
    expect(findPrivatePaths('src={`/assets/home/gallery/${id}.webp`}')).toEqual([]);
  });

  it('flags OneDrive, temp and private review folders', () => {
    expect(findPrivatePaths('Desktop/OneDrive/x')).toContain('OneDrive folder');
    expect(findPrivatePaths(String.raw`AppData\Local\Temp\scratch`)).toContain('Windows temp folder');
    expect(findPrivatePaths(String.raw`..\_audit\2026-01-01-review\notes.md`)).toContain('private review folder');
    expect(findPrivatePaths('production-evidence/P1.csv')).toContain('private evidence folder');
  });

  it('allows the documented placeholders and ordinary identifiers', () => {
    expect(findPrivatePaths(`$env:EMBLEM_AUTHZ_EVIDENCE_DIR = '<PRIVATE_EVIDENCE_DIR>'`)).toEqual([]);
    expect(findPrivatePaths(`New-Item -Force '<PGLITE_TOOLING_DIR>'`)).toEqual([]);
    expect(findPrivatePaths('select * from public.relationship_audit_events')).toEqual([]);
    expect(findPrivatePaths('Point it at the private production-evidence folder.')).toEqual([]);
  });
});
