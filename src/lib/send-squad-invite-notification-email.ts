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
  const { subject, html, text } = buildSquadInviteEmail(params, manageUrl);

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: params.toEmail, subject, html, text }),
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

function ctaButtonHtml(url: string, label: string): string {
  return `<p><a href="${url}" style="display:inline-block;padding:12px 20px;background:#E97435;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">${escapeHtml(label)}</a></p>`;
}

function ctaLineText(url: string, label: string): string {
  return `${label}: ${url}`;
}

function buildSquadInviteEmail(
  params: { template: SquadInviteEmailTemplate; teamName: string; publicReference: string; reason?: string },
  manageUrl: string,
): { subject: string; html: string; text: string } {
  const team = escapeHtml(params.teamName);
  const ref = escapeHtml(params.publicReference);
  switch (params.template) {
    case 'request_received':
      return {
        subject: `We've received your Squad Invite request for ${params.teamName}`,
        html: `<h2>Request received</h2><p>We've received your Squad Invite request for <strong>${team}</strong>. Reference: <strong>${ref}</strong>.</p><p>We aim to review controlled-pilot requests within two business days. We'll email you at this address once it has been reviewed.</p><p>If approved, you'll sign in to add delivery details and receive the link to share with parents.</p>${ctaButtonHtml(manageUrl, 'View request status')}`,
        text: `Request received\n\nWe've received your Squad Invite request for ${params.teamName}. Reference: ${params.publicReference}.\n\nWe aim to review controlled-pilot requests within two business days. We'll email you at this address once it has been reviewed.\n\nIf approved, you'll sign in to add delivery details and receive the link to share with parents.\n\n${ctaLineText(manageUrl, 'View request status')}`,
      };
    case 'changes_requested':
      return {
        subject: `Action needed on your Squad Invite request for ${params.teamName}`,
        html: `<h2>Changes requested</h2><p>Emblem staff have asked for changes to your Squad Invite request for <strong>${team}</strong> (Reference: <strong>${ref}</strong>):</p><p style="padding:12px;background:#fff7ed;border-radius:8px">${escapeHtml(params.reason ?? '')}</p><p>Sign in to review and resubmit.</p>${ctaButtonHtml(manageUrl, 'Review and resubmit')}`,
        text: `Changes requested\n\nEmblem staff have asked for changes to your Squad Invite request for ${params.teamName} (Reference: ${params.publicReference}):\n\n${params.reason ?? ''}\n\nSign in to review and resubmit.\n\n${ctaLineText(manageUrl, 'Review and resubmit')}`,
      };
    case 'approved_link_ready':
      return {
        subject: `Your Squad Invite for ${params.teamName} has been approved`,
        html: `<h2>Your Squad Invite has been approved</h2><p><strong>${team}</strong> · Reference: <strong>${ref}</strong></p><p>Here's what happens next: sign in and complete delivery setup. Once delivery details are added, the link to share with parents becomes available — it isn't ready before then.</p>${ctaButtonHtml(manageUrl, 'Complete setup and get your parent link')}<p style="color:#6b7280;font-size:13px">If you weren't expecting this email, please contact Emblem support before continuing.</p>`,
        text: `Your Squad Invite has been approved\n\n${params.teamName} · Reference: ${params.publicReference}\n\nHere's what happens next: sign in and complete delivery setup. Once delivery details are added, the link to share with parents becomes available — it isn't ready before then.\n\n${ctaLineText(manageUrl, 'Complete setup and get your parent link')}\n\nIf you weren't expecting this email, please contact Emblem support before continuing.`,
      };
    case 'rejected':
      return {
        subject: `Update on your Squad Invite request for ${params.teamName}`,
        html: `<h2>Request not approved</h2><p>Your Squad Invite request for <strong>${team}</strong> (Reference: <strong>${ref}</strong>) was not approved:</p><p style="padding:12px;background:#fef2f2;border-radius:8px">${escapeHtml(params.reason ?? '')}</p>${ctaButtonHtml(manageUrl, 'View request status')}`,
        text: `Request not approved\n\nYour Squad Invite request for ${params.teamName} (Reference: ${params.publicReference}) was not approved:\n\n${params.reason ?? ''}\n\n${ctaLineText(manageUrl, 'View request status')}`,
      };
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
