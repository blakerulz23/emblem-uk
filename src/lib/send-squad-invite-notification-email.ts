/**
 * Sends a Squad Invite lifecycle email directly via Resend's HTTP API —
 * the same integration send-invite-email.ts already uses (Resend is
 * already connected as Supabase's custom SMTP provider and is a named
 * supplier in the privacy policy, so this introduces no new third party).
 *
 * Never throws — a failed or skipped send must not fail the caller, since
 * the underlying request/campaign state is already committed regardless
 * of whether this email lands. Callers use the returned `ok` to update
 * squad_invite_notification_outbox for staff visibility/resend, not to
 * decide whether the lifecycle action itself succeeded.
 *
 * 'approved_link_ready' deliberately never contains the parent-facing
 * invitation link itself, even though its name suggests otherwise — at
 * the point staff approve a request, that link doesn't exist yet (it's
 * only generated once the organiser separately completes delivery setup).
 * This email only ever points back to the manage page, matching the
 * link's own one-time, sign-in-gated reveal design elsewhere in the app
 * (see DeliverySetup.tsx / ReplaceInvitationLink.tsx).
 */
export type SquadInviteEmailTemplate = 'request_received' | 'changes_requested' | 'approved_link_ready' | 'rejected';

export async function sendSquadInviteNotificationEmail(params: {
  toEmail: string;
  template: SquadInviteEmailTemplate;
  teamName: string;
  publicReference: string;
  reason?: string;
}): Promise<{ ok: boolean }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('RESEND_API_KEY not set — skipping Squad Invite notification email; the underlying state is still valid.');
    return { ok: false };
  }

  const from = process.env.RESEND_FROM_EMAIL || 'Emblem <onboarding@resend.dev>';
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://emblem-uk-lauda-collectives-projects.vercel.app';
  const manageUrl = `${siteUrl}/squad-invite/manage/${encodeURIComponent(params.publicReference)}`;
  const { subject, html } = buildSquadInviteEmail(params, manageUrl);

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: params.toEmail, subject, html }),
    });
    if (!res.ok) {
      console.warn('Resend Squad Invite email failed', await res.text().catch(() => ''));
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    // A thrown network error must not bubble up and fail the caller.
    console.warn('Resend Squad Invite email threw', err);
    return { ok: false };
  }
}

function buildSquadInviteEmail(
  params: { template: SquadInviteEmailTemplate; teamName: string; reason?: string },
  manageUrl: string,
): { subject: string; html: string } {
  const team = escapeHtml(params.teamName);
  const button = `<p><a href="${manageUrl}" style="display:inline-block;padding:12px 20px;background:#E97435;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">View your Squad Invite</a></p>`;
  switch (params.template) {
    case 'request_received':
      return {
        subject: `We've received your Squad Invite request for ${params.teamName}`,
        html: `<h2>Request received</h2><p>Your Squad Invite request for <strong>${team}</strong> has been received. Emblem staff aim to review controlled-pilot requests within two business days.</p>${button}`,
      };
    case 'changes_requested':
      return {
        subject: `Action needed on your Squad Invite request for ${params.teamName}`,
        html: `<h2>Changes requested</h2><p>Emblem staff have asked for changes to your Squad Invite request for <strong>${team}</strong>:</p><p style="padding:12px;background:#fff7ed;border-radius:8px">${escapeHtml(params.reason ?? '')}</p><p>Sign in to review and resubmit.</p>${button}`,
      };
    case 'approved_link_ready':
      return {
        subject: `Your Squad Invite request for ${params.teamName} has been approved`,
        html: `<h2>Approved</h2><p>Your Squad Invite request for <strong>${team}</strong> has been approved. Sign in to complete delivery setup and get your parent invitation link.</p>${button}`,
      };
    case 'rejected':
      return {
        subject: `Update on your Squad Invite request for ${params.teamName}`,
        html: `<h2>Request not approved</h2><p>Your Squad Invite request for <strong>${team}</strong> was not approved:</p><p style="padding:12px;background:#fef2f2;border-radius:8px">${escapeHtml(params.reason ?? '')}</p>${button}`,
      };
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
