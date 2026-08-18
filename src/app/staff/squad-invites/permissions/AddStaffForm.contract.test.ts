import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const formSource = readFileSync('src/app/staff/squad-invites/permissions/AddStaffForm.tsx', 'utf8');
const pageSource = readFileSync('src/app/staff/squad-invites/permissions/page.tsx', 'utf8');

describe('AddStaffForm — existing-accounts-only, composes with the existing permission toggles', () => {
  it('posts to the new add-staff route and prevents a double submission', () => {
    expect(formSource).toContain("fetch('/api/staff/squad-invites/permissions/add-staff'");
    expect(formSource).toContain('if (pending || !email.includes(\'@\')) return;');
  });

  it('distinguishes already-staff from newly-added in its own success copy', () => {
    expect(formSource).toContain("body?.alreadyStaff ? 'Already a staff member — see them below.'");
  });

  it('never grants a Squad Invite permission itself — only promotes to staff', () => {
    expect(formSource).not.toMatch(/squad_invite_reviewer|squad_invite_approver/);
  });

  it('has accessible busy/error/success states', () => {
    expect(formSource).toContain('aria-busy={pending}');
    expect(formSource).toContain('role={messageIsError ? \'alert\' : \'status\'}');
  });

  it('is rendered on the permissions page above the existing staff list', () => {
    expect(pageSource).toContain('<AddStaffForm />');
    const addStaffIndex = pageSource.indexOf('<AddStaffForm />');
    const listIndex = pageSource.indexOf('rows.map(');
    expect(addStaffIndex).toBeGreaterThan(-1);
    expect(listIndex).toBeGreaterThan(addStaffIndex);
  });
});
