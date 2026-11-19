/**
 * Keyboard and screen-reader focus around the activation gate on /os.
 *
 * The gate covers the app (a fixed wrapper inside .emblem-os-shell), but the
 * app is still rendered underneath it. While the gate is up, every other
 * direct child of the shell is made inert, so Tab, Shift+Tab and a screen
 * reader's swipe cannot reach controls hidden behind it. aria-hidden is added
 * too, for browsers without inert. The gate's wrapper carries GATE_ATTR and is
 * skipped. Only attributes this helper added are removed again.
 *
 * After activation, focus moves to the first visible control in the app, so
 * it does not fall back to the page body when the gate's button unmounts.
 */
export const GATE_ATTR = 'data-os-gate';
const MARK = 'data-os-gate-inert';
const KEEP_ARIA = 'keep-aria-hidden';

type AttrElement = Pick<Element, 'hasAttribute' | 'getAttribute' | 'setAttribute' | 'removeAttribute'>;
type FocusTarget = {
  closest(selector: string): unknown;
  getClientRects(): { length: number };
  focus(options?: FocusOptions): void;
};

export function setBehindGateInert(shell: { children: ArrayLike<AttrElement> }, gateOpen: boolean): void {
  for (const el of Array.from(shell.children)) {
    if (el.hasAttribute(GATE_ATTR)) continue;
    if (gateOpen) {
      if (el.hasAttribute(MARK)) continue;
      const hadAriaHidden = el.hasAttribute('aria-hidden');
      el.setAttribute(MARK, hadAriaHidden ? KEEP_ARIA : '');
      el.setAttribute('inert', '');
      if (!hadAriaHidden) el.setAttribute('aria-hidden', 'true');
    } else if (el.hasAttribute(MARK)) {
      if (el.getAttribute(MARK) !== KEEP_ARIA) el.removeAttribute('aria-hidden');
      el.removeAttribute('inert');
      el.removeAttribute(MARK);
    }
  }
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Focuses the first visible, reachable control in the shell. Returns whether one was found. */
export function focusFirstInApp(shell: { querySelectorAll(selector: string): ArrayLike<FocusTarget> }): boolean {
  for (const el of Array.from(shell.querySelectorAll(FOCUSABLE))) {
    if (el.closest('[inert], [aria-hidden="true"]')) continue;
    if (el.getClientRects().length === 0) continue;
    el.focus({ preventScroll: true });
    return true;
  }
  return false;
}
