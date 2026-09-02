/**
 * Sends a single "a staff member needs to know this happened" email —
 * same Resend integration and never-throws contract as every other
 * send-*-email.ts in this codebase. Deliberately ONE generic template for
 * all 11 event types, not a bespoke template per event: the summary
 * fields already carry everything event-specific, and a shared template
 * keeps this file from growing by one function every time a 12th trigger
 * point gets added later.
 *
 * `to` accepts multiple addresses (every resolved recipient for the
 * event's scope) — a single send, not one per recipient, matching the
 * "one outbox row per event" design in migration 0082.
 */
const EVENT_LABELS: Record<string, string> = {
  new_squad_invite_request: 'New Squad Invite request',
  deletion_request_filed: 'Player-data deletion request filed',
  auth_deletion_stuck: 'Guardian account deletion needs finishing',
  new_order_pending_approval: 'New order awaiting production approval',
  payment_verification_failed: 'Shopify payment could not be verified',
  finalise_pricing_issues: 'Squad Invite pricing finalisation had failures',
  organiser_concern_flagged: 'Organiser flagged a concern',
  coach_card_submitted: 'Coach card submitted for review',
  squad_invite_payments_overdue: 'Squad Invite payments overdue',
  organiser_notification_failed: 'An organiser-facing email failed to send',
  upload_sweep_errors: 'Upload cleanup sweep had errors',
};

export async function sendStaffNotificationEmail(params: {
  toEmails: string[];
  eventType: string;
  summary: Record<string, unknown>;
  linkPath: string;
}): Promise<{ ok: boolean }> {
  if (params.toEmails.length === 0) {
    console.warn('sendStaffNotificationEmail: no resolved recipients — skipping send.', { eventType: params.eventType });
    return { ok: false };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('RESEND_API_KEY not set — skipping staff notification email.');
    return { ok: false };
  }

  const from = process.env.RESEND_FROM_EMAIL || 'Emblem <onboarding@resend.dev>';
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://emblem-uk-lauda-collectives-projects.vercel.app';
  const link = `${siteUrl}${params.linkPath}`;
  const label = EVENT_LABELS[params.eventType] ?? params.eventType;

  const summaryLines = Object.entries(params.summary).map(([key, value]) => `${escapeHtml(humanizeKey(key))}: ${escapeHtml(String(value))}`);
  const summaryHtml = summaryLines.length ? `<ul>${summaryLines.map((line) => `<li>${line}</li>`).join('')}</ul>` : '';
  const summaryText = summaryLines.length ? `\n${summaryLines.join('\n')}\n` : '';

  const subject = `Emblem staff: ${label}`;
  const html = `<h2>${escapeHtml(label)}</h2>${summaryHtml}<p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#E97435;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">View in staff dashboard</a></p>`;
  const text = `${label}\n${summaryText}\nView in staff dashboard: ${link}`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: params.toEmails, subject, html, text }),
    });
    if (!res.ok) {
      console.warn('Resend staff notification email failed', await res.text().catch(() => ''));
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.warn('Resend staff notification email threw', err);
    return { ok: false };
  }
}

function humanizeKey(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
