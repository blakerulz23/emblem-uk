import fs from 'fs';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { getUser: () => Promise.resolve({ data: { user: null } }) } }) }));

import ActivationGate from './overlays/ActivationGate';
import { GATE_ATTR, focusFirstInApp, setBehindGateInert } from './activation-gate-focus';

/**
 * The "Tap to activate" gate on /os: a real, keyboard-operable button that is
 * focused when the screen opens; the app behind the gate is inert while the
 * gate is up; focus moves into the app after activation. The repo has no DOM
 * library, so the helpers run against small fake elements and the wiring is
 * checked in the source, as in the other *-contract tests.
 */

const gateSource = fs.readFileSync('src/app/os/overlays/ActivationGate.tsx', 'utf8');
const appSource = fs.readFileSync('src/app/os/OsApp.tsx', 'utf8');

describe('the Tap to activate control', () => {
  const landing = () => renderToStaticMarkup(<ActivationGate onActivate={() => {}} hasSession profileRole="parent" view="parent" teamRequest={null} />);

  it('renders as a native button with type="button", not a clickable div', () => {
    const html = landing();
    expect(html).toMatch(/<button type="button"[^>]*>(?:(?!<\/button>)[\s\S])*Tap to activate<\/button>/);
    expect(html).not.toMatch(/<div[^>]*cursor:pointer[^>]*>(?:(?!<\/div>)[\s\S])*Tap to activate/);
  });

  it('keeps the original look: same colours, padding, radius and shadow, with no border or margin', () => {
    const html = landing();
    const button = html.match(/<button type="button"[^>]*style="([^"]*)"/)![1];
    for (const rule of ['display:inline-flex', 'background:#E97435', 'color:#0B0A09', 'font-weight:800', 'font-size:15px', 'padding:15px 30px', 'border-radius:14px', 'cursor:pointer', 'box-shadow:0 16px 34px -16px rgba(233,116,53,.8)', 'margin:0', 'border:0']) {
      expect(button).toContain(rule);
    }
    expect(button).not.toMatch(/outline\s*:/);
  });

  it('is wired to onActivate and focused when the screen opens', () => {
    expect(gateSource).toMatch(/<button type="button" onClick=\{onActivate\} autoFocus /);
    expect(gateSource).not.toMatch(/<div onClick=\{onActivate\}/);
  });
});

describe('OsApp wiring', () => {
  it('marks the gate wrapper, and passes the shell to the helpers', () => {
    expect(appSource).toMatch(/\{!state\.activated && \(\s*<div data-os-gate="" style=\{\{ position: 'fixed', inset: 0, zIndex: 80 \}\}>\s*<ActivationGate/);
    expect(appSource).toContain('<div className="emblem-os-shell" ref={shellRef}>');
    expect(appSource).toMatch(/setBehindGateInert\(shellRef\.current, !state\.activated\);\s*\}\);/);
    expect(appSource).toMatch(/if \(!was && state\.activated && shellRef\.current\) focusFirstInApp\(shellRef\.current\);\s*\}, \[state\.activated\]\);/);
    expect(GATE_ATTR).toBe('data-os-gate');
  });
});

class FakeElement {
  attrs = new Map<string, string>();
  constructor(init: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(init)) this.attrs.set(k, v);
  }
  hasAttribute(n: string) { return this.attrs.has(n); }
  getAttribute(n: string) { return this.attrs.get(n) ?? null; }
  setAttribute(n: string, v: string) { this.attrs.set(n, String(v)); }
  removeAttribute(n: string) { this.attrs.delete(n); }
}
const shellOf = (...children: FakeElement[]) => ({ children });

describe('setBehindGateInert', () => {
  it('makes every non-gate child inert and aria-hidden while the gate is open, leaving the gate alone', () => {
    const gate = new FakeElement({ [GATE_ATTR]: '' }), top = new FakeElement(), nav = new FakeElement();
    setBehindGateInert(shellOf(gate, top, nav), true);
    for (const el of [top, nav]) {
      expect(el.getAttribute('inert')).toBe('');
      expect(el.getAttribute('aria-hidden')).toBe('true');
    }
    expect(gate.hasAttribute('inert')).toBe(false);
    expect(gate.hasAttribute('aria-hidden')).toBe(false);
  });

  it('removes exactly what it added when the gate closes', () => {
    const gate = new FakeElement({ [GATE_ATTR]: '' }), top = new FakeElement({ id: 'top' });
    const shell = shellOf(gate, top);
    setBehindGateInert(shell, true);
    setBehindGateInert(shell, false);
    expect(Array.from(top.attrs.entries())).toEqual([['id', 'top']]);
  });

  it('keeps an aria-hidden the element already had', () => {
    const spacer = new FakeElement({ 'aria-hidden': 'true' });
    const shell = shellOf(spacer);
    setBehindGateInert(shell, true);
    expect(spacer.hasAttribute('inert')).toBe(true);
    setBehindGateInert(shell, false);
    expect(spacer.hasAttribute('inert')).toBe(false);
    expect(spacer.getAttribute('aria-hidden')).toBe('true');
  });

  it('is idempotent and never touches children it did not mark', () => {
    const top = new FakeElement(), untouched = new FakeElement({ 'aria-hidden': 'true' });
    const shell = shellOf(top);
    setBehindGateInert(shell, true);
    setBehindGateInert(shell, true);
    expect(top.getAttribute('aria-hidden')).toBe('true');
    setBehindGateInert(shellOf(untouched), false);
    expect(untouched.getAttribute('aria-hidden')).toBe('true');
    expect(() => setBehindGateInert(shellOf(), true)).not.toThrow();
  });
});

describe('focusFirstInApp', () => {
  const target = (opts: { hidden?: boolean; invisible?: boolean } = {}) => ({
    closest: vi.fn(() => (opts.hidden ? {} : null)),
    getClientRects: () => ({ length: opts.invisible ? 0 : 1 }),
    focus: vi.fn(),
  });

  it('focuses the first visible control that is not inside an inert or aria-hidden region, without scrolling', () => {
    const inHidden = target({ hidden: true }), invisible = target({ invisible: true }), first = target(), second = target();
    const querySelectorAll = vi.fn((selector: string) => (selector ? [inHidden, invisible, first, second] : []));
    expect(focusFirstInApp({ querySelectorAll })).toBe(true);
    expect(first.focus).toHaveBeenCalledWith({ preventScroll: true });
    for (const t of [inHidden, invisible, second]) expect(t.focus).not.toHaveBeenCalled();
    expect(inHidden.closest).toHaveBeenCalledWith('[inert], [aria-hidden="true"]');
    expect(querySelectorAll.mock.calls[0][0]).toContain('button:not([disabled])');
  });

  it('returns false and focuses nothing when the app has no reachable control', () => {
    expect(focusFirstInApp({ querySelectorAll: () => [target({ hidden: true })] })).toBe(false);
  });
});
