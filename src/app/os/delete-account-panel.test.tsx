import { describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import DeleteAccountPanel, { type DeleteAccountPanelProps } from './overlays/DeleteAccountPanel';
import {
  CLEARED_DELETE_FLOW,
  deletionDoneMessage,
  deletionOutcome,
  deletionRedirectDelayMs,
  sendCodeButton,
  sendCodeFailureMessage,
} from '@/lib/account-deletion-flow';
import { DELETION_REVIEW_COACHING_PAUSED, DELETION_REVIEW_RESPONSE, GUARDIAN_DELETE_CONFIRM, SETTINGS_REVIEW_TITLE } from '@/lib/account-deletion-copy';

const noop = () => {};
const base: DeleteAccountPanelProps = {
  audience: 'coach',
  email: 'coach@example.test',
  emailLoaded: true,
  step: 'explain',
  reauthCode: '',
  reauthStatus: 'idle',
  reauthError: null,
  deleteStatus: 'idle',
  deleteError: null,
  outcome: null,
  reviewStatus: null,
  onStart: noop,
  onCancel: noop,
  onSendCode: noop,
  onCodeChange: noop,
  onVerify: noop,
  onDelete: noop,
};
const html = (p: Partial<DeleteAccountPanelProps>) => renderToStaticMarkup(<DeleteAccountPanel {...base} {...p} />);

type Node = { props?: { role?: string; 'aria-label'?: string; 'aria-disabled'?: boolean; onClick?: () => void; children?: unknown } };
function findButton(node: unknown, label: string): Node | null {
  if (!node || typeof node !== 'object') return null;
  const n = node as Node;
  if (n.props?.role === 'button' && (n.props['aria-label'] === label || n.props['aria-label']?.startsWith(`${label}:`))) return n;
  const kids = n.props?.children;
  for (const k of Array.isArray(kids) ? kids : [kids]) {
    const hit = findButton(k, label);
    if (hit) return hit;
  }
  return null;
}
const tree = (p: Partial<DeleteAccountPanelProps>) => DeleteAccountPanel({ ...base, ...p }) as ReactElement;

describe('Send code failure is shown on the current step', () => {
  it('the explain step (where Send code lives) shows the failure as an alert', () => {
    const message = sendCodeFailureMessage('For security purposes, you can only request this after 42 seconds.');
    const out = html({ step: 'explain', reauthStatus: 'error', reauthError: message });
    expect(out).toContain('role="alert"');
    expect(out).toContain("We couldn&#x27;t send a code. For security purposes, you can only request this after 42 seconds.");
  });

  it('a failure with no reason still says what happened', () => {
    expect(sendCodeFailureMessage('')).toBe("We couldn't send a code. Please try again.");
    expect(sendCodeFailureMessage(undefined)).toBe("We couldn't send a code. Please try again.");
  });

  it('after a failure the button is usable again for a retry', () => {
    const button = findButton(tree({ step: 'explain', reauthStatus: 'error', reauthError: 'x' }), 'Send verification code');
    expect(button?.props?.['aria-disabled']).toBe(false);
    expect(typeof button?.props?.onClick).toBe('function');
  });
});

describe('Send code waits for the email address', () => {
  it('while the email is loading: disabled, says so, and does nothing when tapped', () => {
    expect(sendCodeButton({ email: null, emailLoaded: false, reauthStatus: 'idle' })).toEqual({ disabled: true, label: 'Loading your email…', note: null });
    const onSendCode = vi.fn();
    const button = findButton(tree({ step: 'explain', email: null, emailLoaded: false, onSendCode }), 'Send verification code');
    expect(button?.props?.['aria-disabled']).toBe(true);
    expect(button?.props?.onClick).toBeUndefined();
    expect(html({ step: 'explain', email: null, emailLoaded: false })).toContain('Loading your email…');
    // Screen readers hear the state too, and the button stays in the tab order.
    expect(html({ step: 'explain', email: null, emailLoaded: false })).toContain('aria-label="Send verification code: Loading your email…"');
    expect(html({ step: 'explain', email: null, emailLoaded: false })).not.toContain('tabindex="-1"');
  });

  it('if the email never loads: disabled with a clear way forward', () => {
    const state = sendCodeButton({ email: null, emailLoaded: true, reauthStatus: 'idle' });
    expect(state.disabled).toBe(true);
    expect(html({ step: 'explain', email: null, emailLoaded: true })).toContain('Close Account Settings and open it again');
  });

  it('while a code is being sent: disabled with "Sending…"', () => {
    expect(sendCodeButton({ email: 'a@example.test', emailLoaded: true, reauthStatus: 'sending' })).toEqual({ disabled: true, label: 'Sending…', note: null });
  });

  it('once loaded: enabled and wired to send', () => {
    const onSendCode = vi.fn();
    const button = findButton(tree({ step: 'explain', onSendCode }), 'Send verification code');
    button!.props!.onClick!();
    expect(onSendCode).toHaveBeenCalledTimes(1);
  });
});

describe('Cancel closes the flow and clears stale errors', () => {
  it('the cleared state has no step, code, status or message left over', () => {
    expect(CLEARED_DELETE_FLOW).toEqual({ step: 'idle', reauthCode: '', reauthStatus: 'idle', reauthError: null, deleteError: null });
  });

  it.each(['explain', 'reauth-code', 'confirm'] as const)('Cancel on the %s step calls onCancel', (step) => {
    const onCancel = vi.fn();
    findButton(tree({ step, onCancel }), 'Cancel')!.props!.onClick!();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Cancel is inert while any request is in flight, so a late result cannot reopen a cancelled flow', () => {
    expect(findButton(tree({ step: 'confirm', deleteStatus: 'deleting' }), 'Cancel')?.props?.onClick).toBeUndefined();
    expect(findButton(tree({ step: 'explain', reauthStatus: 'sending' }), 'Cancel')?.props?.onClick).toBeUndefined();
    expect(findButton(tree({ step: 'reauth-code', reauthStatus: 'verifying' }), 'Cancel')?.props?.onClick).toBeUndefined();
  });

  it('AccountSettings wires every Cancel to the reset that applies all of the cleared state', () => {
    const src = fs.readFileSync(path.join(__dirname, 'overlays/AccountSettings.tsx'), 'utf8');
    expect(src).toContain('onCancel={cancelDelete}');
    const body = src.slice(src.indexOf('const cancelDelete = () => {'), src.indexOf('};', src.indexOf('const cancelDelete = () => {')));
    for (const [setter, field] of [['setDeleteStep', 'step'], ['setReauthCode', 'reauthCode'], ['setReauthStatus', 'reauthStatus'], ['setReauthError', 'reauthError'], ['setDeleteAccountError', 'deleteError']]) {
      expect(body).toContain(`${setter}(CLEARED_DELETE_FLOW.${field})`);
    }
  });
});

describe('parent confirmation copy', () => {
  it('no longer promises immediate removal: a parent may go to staff review', () => {
    const out = html({ audience: 'guardian', playerName: 'Sam', step: 'confirm' });
    expect(out).not.toContain('removed immediately');
    expect(GUARDIAN_DELETE_CONFIRM).toContain('If nothing needs staff review');
    expect(GUARDIAN_DELETE_CONFIRM).toContain('nothing is deleted until they decide');
    expect(GUARDIAN_DELETE_CONFIRM).not.toMatch(/in touch|email us|hello@/i);
    const explain = html({ audience: 'guardian', playerName: 'Sam', step: 'explain' });
    expect(explain).toContain('If nothing needs staff review (see the last point), this deletes');
    expect(explain).toContain('your request goes to Emblem staff for review instead');
  });
});

describe('the outcome of a deletion request', () => {
  it('a staff review (identityRetained) never reads as deleted or removed', () => {
    const outcome = deletionOutcome({ ok: true, partial: true, identityRetained: true, coachAccessSuspended: 0 });
    expect(outcome).toEqual({ kind: 'review', coachPaused: false });
    const out = html({ audience: 'guardian', playerName: 'Sam', step: 'done', outcome });
    expect(out).toContain(DELETION_REVIEW_RESPONSE);
    expect(out).not.toMatch(/has been deleted|been removed/);
    expect(out).not.toContain(DELETION_REVIEW_COACHING_PAUSED);
    expect(deletionRedirectDelayMs(outcome)).toBe(6000);
  });

  it('a coach whose access was paused for the review is told so', () => {
    const outcome = deletionOutcome({ ok: true, partial: true, identityRetained: true, coachAccessSuspended: 2 });
    expect(outcome).toEqual({ kind: 'review', coachPaused: true });
    expect(html({ step: 'done', outcome })).toContain(DELETION_REVIEW_COACHING_PAUSED);
  });

  it('partial and full deletions keep their own messages', () => {
    expect(deletionDoneMessage(deletionOutcome({ ok: true, partial: true }))).toContain('still finishing the revocation of your sign-in');
    expect(deletionDoneMessage(deletionOutcome({ ok: true, partial: false }))).toBe('Your account has been deleted. Signing you out…');
    expect(deletionDoneMessage(deletionOutcome(null))).toBe('Your account has been deleted. Signing you out…');
  });

  it('an account already under review sees the review status, not the delete button alone', () => {
    const out = html({ step: 'idle', reviewStatus: { underReview: true, coachAccessPaused: true } });
    expect(out).toContain(SETTINGS_REVIEW_TITLE);
    expect(out).toContain('aria-label="Delete account"');
  });
});
