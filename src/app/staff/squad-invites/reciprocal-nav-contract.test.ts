import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const QUEUE_PAGE = 'src/app/staff/squad-invites/page.tsx';
const PLAYER_ORDERS_PAGE = 'src/app/staff/queue/page.tsx';
const page = readFileSync(QUEUE_PAGE, 'utf8');
const playerOrders = readFileSync(PLAYER_ORDERS_PAGE, 'utf8');

/**
 * Player Orders (/staff/queue) already links prominently to Squad Invites;
 * this page's own link back was a small text tab, easy to miss on mobile.
 * Guards the reciprocal "Back to Player Orders" control this fixes, and
 * that everything else about this page (tabs, panel, queue logic) is
 * untouched.
 */
describe('Squad Invites queue — reciprocal navigation back to Player Orders', () => {
  it('the heading is simplified to just "Squad Invites" — the old "Player Queue → Squad Invites" wording is gone', () => {
    expect(page).toContain('<h1 className="mt-3 text-3xl font-bold">Squad Invites</h1>');
    expect(page).not.toContain('Player Queue');
  });

  it('a real link (not a clickable div) points back to the actual Player Orders route, placed between the heading and the staff identity panel', () => {
    const h1Idx = page.indexOf('<h1 className="mt-3 text-3xl font-bold">Squad Invites</h1>');
    const linkIdx = page.indexOf('href="/staff/queue"', h1Idx);
    const panelIdx = page.indexOf('<StaffIdentityPanel', h1Idx);
    expect(h1Idx).toBeGreaterThan(-1);
    expect(linkIdx).toBeGreaterThan(h1Idx);
    expect(linkIdx).toBeLessThan(panelIdx);
    expect(page.slice(h1Idx, linkIdx)).toContain('<Link');
  });

  it('reads "← Back to Player Orders"', () => {
    expect(page).toContain('← Back to Player Orders');
  });

  it('is full-width on mobile and an auto (non-stretched) width from the sm breakpoint up', () => {
    const idx = page.indexOf('← Back to Player Orders');
    const tagStart = page.lastIndexOf('<Link', idx);
    const tag = page.slice(tagStart, idx);
    expect(tag).toContain('w-full');
    expect(tag).toContain('sm:w-auto');
  });

  it('meets the 44px minimum touch target and has hover, focus-visible, and active states — a restrained outline style, not a filled primary button', () => {
    const idx = page.indexOf('← Back to Player Orders');
    const tagStart = page.lastIndexOf('<Link', idx);
    const tag = page.slice(tagStart, idx);
    expect(tag).toContain('min-h-[44px]');
    expect(tag).toContain('hover:bg-orange-50');
    expect(tag).toContain('focus-visible:outline');
    expect(tag).toContain('active:bg-orange-100');
    // Outline, not filled: border + coloured text, no solid background fill class.
    expect(tag).toContain('border-2 border-orange-600');
    expect(tag).toContain('text-orange-600');
    expect(tag).not.toMatch(/bg-orange-600(?!\/)/);
  });

  it('does not remove or alter the existing top navigation tabs (Player Orders / Squad Invites / Profile Setup / Data Requests)', () => {
    expect(page).toContain('<nav className="mt-6 flex flex-wrap gap-2 text-sm">');
    expect(page).toContain('<Link href="/staff/queue" className="hover:underline">Player Orders</Link>');
    expect(page).toContain('<Link href="/staff/queue#profile-setup" className="hover:underline">Profile Setup</Link>');
    expect(page).toContain('<Link href="/staff/deletion-requests" className="hover:underline">Data Requests</Link>');
  });

  it('does not touch queue logic, search/sort/filter, status counts, or the database query', () => {
    expect(page).toContain("const status=searchParams.status;");
    expect(page).toContain("const sort=searchParams.sort==='oldest'?'oldest':'newest'");
    expect(page).toContain('.from(\'squad_invite_requests\')');
    expect(page).toContain('STATUS_TABS');
  });

  it('the reverse direction (Player Orders → Squad Invites) already exists on the Player Orders page and was not touched here', () => {
    expect(playerOrders).toContain('href="/staff/squad-invites"');
    expect(playerOrders).toContain('>Squad Invites</Link>');
  });
});
