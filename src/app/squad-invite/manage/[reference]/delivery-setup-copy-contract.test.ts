import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const DELIVERY_SETUP = 'src/app/squad-invite/manage/[reference]/DeliverySetup.tsx';
const MANAGE_PAGE = 'src/app/squad-invite/manage/[reference]/page.tsx';
const read = (path: string) => readFileSync(path, 'utf8');

describe('Delivery setup — clarified courier contact field', () => {
  it('uses the requested label, helper text and placeholder for the courier contact field', () => {
    const source = read(DELIVERY_SETUP);
    expect(source).toContain("courierContact:'Courier contact'");
    expect(source).toContain('A phone number or email the courier can use if there is a delivery problem.');
    expect(source).toContain("courierContact:'Phone number or email address'");
  });

  it('does not change the posted field name — same data contract as before', () => {
    const source = read(DELIVERY_SETUP);
    expect(source).toContain("useState({address:'',postcode:'',courierContact:'',instructions:''})");
    expect(source).toContain('JSON.stringify(form)');
  });
});

describe('Organiser manage page — landmark and status presentation', () => {
  it('does not introduce a duplicate <main> landmark — shared chrome already renders one for /squad-invite/*', () => {
    const source = read(MANAGE_PAGE);
    expect(source).not.toContain('<main');
  });

  it('keeps the exact back-link to the organiser\'s Squad Invite list', () => {
    const source = read(MANAGE_PAGE);
    expect(source).toContain('href="/squad-invite/start"');
    expect(source).toContain('Back to your Squad Invites');
  });

  it('stays clear of the fixed-bottom disposable notice on this route', () => {
    const source = read(MANAGE_PAGE);
    expect(source).toContain('pb-28');
  });
});
