'use client';

import OrganiserStart from '@/app/squad-invite/start/OrganiserStart';

declare global {
  interface Window {
    __harnessNetworkLog?: string[];
  }
}

const CONTEXT_PATH = '/api/squad-invite-organiser-auth/context';
const REQUEST_CODE_PATH = '/api/squad-invite-organiser-auth/request-code';
const VERIFY_CODE_PATH = '/api/squad-invite-organiser-auth/verify-code';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/**
 * Installs the network boundary for this harness exactly once per page load,
 * before OrganiserStart's first render effect can fire. Every call — matched
 * or not — is appended to window.__harnessNetworkLog so an external driver
 * (Playwright) can assert on exactly what would have left the browser,
 * without needing to race real request/response events.
 *
 * Only the three organiser-auth endpoints this component calls before the
 * review step are answered synthetically. Everything else, most importantly
 * POST /api/squad-invite-requests (the real submission endpoint), is logged
 * and rejected — never forwarded to the real network — so an accidental
 * Submit click during manual or automated driving cannot reach a real route,
 * let alone Supabase.
 */
function installNetworkBoundary() {
  if (typeof window === 'undefined' || window.__harnessNetworkLog) return;
  window.__harnessNetworkLog = [];
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const path = new URL(url, window.location.origin).pathname;
    window.__harnessNetworkLog!.push(`${init?.method ?? 'GET'} ${path}`);

    if (path === CONTEXT_PATH) return jsonResponse({ csrfToken: 'harness-synthetic-csrf-token' });
    if (path === REQUEST_CODE_PATH) return jsonResponse({ ok: true });
    if (path === VERIFY_CODE_PATH) return jsonResponse({ ok: true });

    // Anything else — notably the real submission endpoint — never reaches
    // the network. This harness is database-free by construction, not just
    // by test discipline. The original window.fetch is deliberately not
    // retained anywhere: there is nothing in this file that should ever
    // fall back to it.
    return jsonResponse({ error: 'blocked in database-free harness' }, 403);
  };
}

installNetworkBoundary();

export default function OrganiserFormHarness() {
  return (
    <div>
      <div className="si-preview-bar" style={{ padding: '0.5rem 1rem', fontWeight: 700, background: '#111', color: '#fff' }}>
        Database-free organiser form harness — no Supabase, no real network calls beyond this page
      </div>
      <OrganiserStart />
    </div>
  );
}
