'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import './preview.css';
import './badge.css';

const states = [
  ['create', 'Create Squad Invite'], ['approval', 'Awaiting staff approval'], ['staff', 'Staff approval'],
  ['publish', 'Publish and reusable link'], ['share', 'WhatsApp share preview'], ['invite', 'Parent invitation'],
  ['verify', 'New parent verification'], ['resume', 'Returning parent'], ['builder', 'One-child builder'],
  ['permissions', 'Permissions'], ['committed', 'Commitment confirmation'], ['closed', 'Closed/deadline'],
  ['dashboard', 'Organiser dashboard'], ['squad', 'Squad price unlocked'], ['coach-pending', 'Coach card pending'],
  ['coach-config', 'Coach card configuration'], ['fulfilment', 'Distribution view'], ['links', 'Link exception states'],
] as const;
type PreviewState = typeof states[number][0];

const deadline = new Date(Date.now() + 7 * 86400000);
const dateText = deadline.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const invitationPath = '/squad-invite/access#token=••••••••••••••••';

function Pill({ children, tone = 'green' }: { children: React.ReactNode; tone?: 'green' | 'amber' | 'grey' | 'red' }) {
  return <span className={`si-pill ${tone}`}>{children}</span>;
}
function Metric({ value, label }: { value: string; label: string }) {
  return <div className="si-metric"><strong>{value}</strong><span>{label}</span></div>;
}
function Notice() {
  return <div className="si-notice"><span className="si-icon">!</span><div><strong>Payment requests are not active</strong><span>This preview never charges anyone or contacts Shopify.</span></div></div>;
}
function BrandHeader() {
  return <header className="si-brand"><button type="button" className="si-icon-button" aria-label="Go back">←</button><div className="si-brand-lockup"><Image src="/embm-nav.png" width={108} height={32} style={{ height: 'auto' }} alt="Emblem"/><span>Squad Invite</span></div><span className="si-help-label">Help</span></header>;
}
function ClubBadge({ className = '' }: { className?: string }) {
  return <span className={`si-badge-crop ${className}`} role="img" aria-label="Ashton Juniors approved fictional badge"><Image src="/templates/hollinwood-red/club-badge-ashton.png" width={1024} height={1536} priority alt=""/></span>;
}
function ProductCard({ coach = false }: { coach?: boolean }) {
  return <div className="si-product-card" aria-label={`${coach ? 'Coach' : 'Synthetic player'} card artwork`}><div className="si-card-shine"/><ClubBadge className="si-card-badge"/><span className="si-card-kicker">ASHTON JUNIORS</span><div className="si-card-avatar">{coach ? 'CJ' : 'MR'}</div><strong>{coach ? 'COACH JORDAN' : 'MAYA R.'}</strong><small>{coach ? 'HEAD COACH' : '08 · MIDFIELDER'}</small><b>EMBLEM</b></div>;
}

export default function SquadInvitePreview() {
  const [state, setState] = useState<PreviewState>('create');
  const index = states.findIndex(([id]) => id === state);
  const go = (offset: number) => setState(states[(index + offset + states.length) % states.length][0]);
  const screen = useMemo(() => {
    switch (state) {
      case 'create': return <><Hero eyebrow="Organiser setup" title="Create a Squad Invite" copy="One team link. Each parent builds and commits individually. Payment requests are not active in this preview."/><FormRows rows={['Ashton Juniors U10', 'Under 10', 'Organiser: Coach Jordan', `Invitation deadline: ${dateText}`, 'Estimated squad participation: 15']}/><Check text="I am an adult authorised to create and share this Squad Invite."/><button className="si-primary" onClick={() => setState('approval')}>Send for staff approval <span>→</span></button></>;
      case 'approval': return <><Hero eyebrow="Draft saved" title="Waiting for Emblem review" copy="The invitation cannot be shared until an authorised staff member approves it."/><StatusSteps active={1}/><Pill tone="amber">Awaiting staff approval</Pill><Notice/><button className="si-primary" onClick={() => setState('staff')}>Open staff review <span>→</span></button></>;
      case 'staff': return <><Hero eyebrow="Staff control" title="Review campaign" copy="Confirm the declared organiser, team-delivery recipient and campaign deadline."/><Review/><div className="si-actions"><button className="si-secondary">Return to organiser</button><button className="si-primary" onClick={() => setState('publish')}>Approve campaign</button></div></>;
      case 'publish': return <><Hero eyebrow="Approved" title="Your team link is ready" copy="Share it in the existing parent WhatsApp group. It contains no child or parent information."/><div className="si-link"><code>{invitationPath}</code><button>Copy</button></div><div className="si-actions"><button className="si-secondary">Pause link</button><button className="si-primary" onClick={() => setState('share')}>Share invitation</button></div></>;
      case 'share': return <><Hero eyebrow="WhatsApp preview" title="Ready to share" copy="No contacts or group membership are sent to Emblem."/><div className="si-phone"><div className="si-phone-top">Ashton Juniors parents <span>•••</span></div><div className="si-message"><b>Coach Jordan</b><p>Ashton Juniors U10 has opened an Emblem Squad Invite. Create your child’s personalised sporting card privately by {dateText}. Participation is optional.</p><div className="si-share-card"><ClubBadge/><span><b>Join Ashton Juniors U10</b><small>2 more unlock £18.99 · One team delivery</small></span></div><code>{invitationPath}</code></div></div><button className="si-primary" onClick={() => setState('invite')}>Preview parent opening link <span>→</span></button></>;
      case 'invite': return <><div className="si-invite-hero"><div><ClubBadge className="si-club-badge"/><Hero eyebrow="Ashton Juniors · Under 10" title="Make their moment iconic." copy="Create your child’s card for this team order."/></div><ProductCard/></div><Progress/><div className="si-trust"><b>Private. Secure. Guardian controlled.</b><span>Participation is optional. No participant list or child photograph is public.</span></div><Delivery/><Notice/><button className="si-primary" onClick={() => setState('verify')}>Join this Squad Invite <span>→</span></button></>;
      case 'verify': return <><Hero eyebrow="Private parent session" title="Verify your email" copy="We’ll send a one-time code so you can return safely to this campaign."/><label className="si-field">Email address<input defaultValue="alex.taylor@example.test" type="email"/></label><button className="si-primary" onClick={() => setState('builder')}>Send verification code <span>→</span></button><button className="si-text" onClick={() => setState('resume')}>Preview returning parent instead</button></>;
      case 'resume': return <><Hero eyebrow="Welcome back" title="Resume your private card" copy="Your existing participation was found. The shared team link never exposes this builder."/><Pill>Private participation resumed</Pill><button className="si-primary" onClick={() => setState('builder')}>Continue card <span>→</span></button></>;
      case 'builder': return <><Hero eyebrow="Private builder · Step 2 of 4" title="Build their card" copy="This information is not visible to Coach Jordan or other parents."/><div className="si-builder-layout"><ProductCard/><FormRows rows={['Display name: Maya Reed', 'Squad number: 8', 'Position: Midfielder', 'Quantity: 1']}/></div><p className="si-help">Synthetic initials only. No real photograph is used.</p><button className="si-primary" onClick={() => setState('permissions')}>Review permissions <span>→</span></button></>;
      case 'permissions': return <><Hero eyebrow="Separate acknowledgements" title="You stay in control" copy="Required permissions are recorded separately and are not marketing consent."/><div className="si-permissions"><Check text="I have authority to submit this child’s information."/><Check text="I authorise the photograph for card manufacture."/><Check text="I understand this is consolidated team delivery."/><Check text="I understand this is a payment-neutral commitment."/><div className="si-check muted"><input type="checkbox" disabled/><span>Private registration — deferred until after the pilot</span></div></div><button className="si-primary" onClick={() => setState('committed')}>Complete commitment <span>→</span></button></>;
      case 'committed': return <><div className="si-success-mark">✓</div><Hero eyebrow="Commitment completed" title="You have not been charged" copy="When the invitation closes, Emblem will confirm the final group price. Payment requests are currently disabled."/><Pill>Card commitment saved</Pill><Delivery/><button className="si-primary" onClick={() => setState('dashboard')}>Return to preview journey <span>→</span></button></>;
      case 'closed': return <><Hero eyebrow="Campaign closed" title="New card starts are closed" copy="Parents who began before the deadline may complete during the 24-hour grace period."/><Pill tone="grey">Pricing finalises after grace</Pill><Progress/><Notice/></>;
      case 'dashboard': return <><Hero eyebrow="Organiser dashboard" title="Ashton Juniors U10" copy="Aggregate progress only. No parent list, payment details or child photographs."/><div className="si-dashboard-strip"><div><span>Campaign progress</span><strong>8 of 15</strong></div><div className="si-ring">53%</div></div><div className="si-grid"><Metric value="8" label="completed commitments"/><Metric value="£21.99" label="current card price"/><Metric value="2" label="needed for squad price"/><Metric value="Locked" label="free coach card"/></div><StatusSteps active={2}/><Delivery/><button className="si-primary" onClick={() => setState('squad')}>Preview 10 commitments <span>→</span></button></>;
      case 'squad': return <><div className="si-celebrate">SQUAD PRICE UNLOCKED</div><Hero eyebrow="Pricing finalised" title="£18.99 per card" copy="Ten completed commitments freeze the squad price. Commitments are not payments."/><div className="si-grid"><Metric value="10" label="completed commitments"/><Metric value="£18.99" label="frozen unit price"/></div><Pill tone="amber">Free coach card not confirmed</Pill><Notice/></>;
      case 'coach-pending': return <><div className="si-coach-layout"><ProductCard coach/><div><Hero eyebrow="Separate qualification" title="Free coach card pending" copy="In the future live product, the free coach card requires ten successfully paid player orders. Payment requests are not active in this preview."/><div className="si-grid"><Metric value="10" label="commitments"/><Metric value="Not active" label="payment requests"/></div><Pill tone="amber">Coach card not yet confirmed</Pill></div></div></>;
      case 'coach-config': return <><Hero eyebrow="Adult card · proposed" title="Configure coach card" copy="This card never creates a child profile or Player OS account."/><div className="si-builder-layout"><ProductCard coach/><FormRows rows={['Coach Jordan', 'Role: Head coach', 'Team: Ashton Juniors U10', 'Design: Emblem black']}/></div><Pill tone="amber">Saved · not production eligible</Pill><button className="si-primary">Save configuration</button></>;
      case 'fulfilment': return <><Hero eyebrow="Consolidated fulfilment" title="One team package" copy="One standard UK delivery to Coach Jordan. Each card is individually sealed for private distribution."/><div className="si-box-visual"><b>EMBLEM</b><span>ASHTON JUNIORS U10</span><small>15 sealed card envelopes · one organiser delivery</small></div><div className="si-package"><b>Package SI-014</b><span>For the parent/guardian of Maya R. — No. 8</span><Pill>Sealed</Pill></div><p className="si-help">No email, phone, address, consent record, internal child ID or NFC claim secret appears here.</p></>;
      case 'links': return <><Hero eyebrow="Reusable link controls" title="This invitation is unavailable" copy="Invalid, expired, paused and revoked links use the same privacy-preserving response."/><div className="si-unavailable">Link unavailable</div><div className="si-link-grid">{[['Invalid', 'Unavailable'], ['Expired', 'Unavailable'], ['Paused', 'Unavailable'], ['Revoked', 'Unavailable'], ['Replaced', 'Old link unavailable']].map(([a, b]) => <button key={a}><b>{a} link</b><span>{b}</span></button>)}</div><button className="si-secondary">Replace shared link</button><p className="si-help">Existing private participations survive replacement without retaining public-link authority.</p></>;
    }
  }, [state]);

  return <main className="si-preview"><div className="si-shell"><div className="si-preview-bar"><b>Synthetic product preview</b><span>No database · no Shopify · no real child data</span></div><BrandHeader/><nav className="si-switcher" aria-label="Preview state"><button onClick={() => go(-1)} aria-label="Previous state">←</button><select value={state} onChange={(e) => setState(e.target.value as PreviewState)}>{states.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select><button onClick={() => go(1)} aria-label="Next state">→</button></nav><section className="si-screen" aria-label={states[index][1]}>{screen}</section><footer className="si-footer"><span className="si-footer-identity">© Emblem</span><span>Privacy</span><span>Safety</span><span>Support</span></footer></div></main>;
}

function Hero({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) { return <header className="si-header"><span>{eyebrow}</span><h1>{title}</h1><p>{copy}</p></header>; }
function FormRows({ rows }: { rows: string[] }) { return <div className="si-rows">{rows.map((row) => <div key={row}>{row}<span>›</span></div>)}</div>; }
function Check({ text }: { text: string }) { return <label className="si-check"><input type="checkbox" defaultChecked/><span>{text}</span></label>; }
function Delivery() { return <div className="si-delivery"><span className="si-icon">↗</span><div><b>Delivered together to your organiser</b><span>Cards arrive in one team package for Coach Jordan to distribute to participating families.</span></div></div>; }
function Progress() { return <><div className="si-grid"><Metric value="8 / 15" label="completed commitments"/><Metric value="£21.99" label="current price"/></div><div className="si-progress"><i/><span>2 more commitments unlock £18.99</span></div><Pill tone="amber">Free coach card not yet confirmed</Pill></>; }
function StatusSteps({ active }: { active: number }) { return <div className="si-steps">{['Created', 'Staff approval', 'Shared', 'Closed'].map((x, i) => <span className={i <= active ? 'done' : ''} key={x}>{x}</span>)}</div>; }
function Review() { return <div className="si-rows"><div>Team <b>Ashton Juniors U10</b></div><div>Organiser <b>Coach Jordan</b></div><div>Deadline <b>{dateText}</b></div><div>Delivery <b>One organiser shipment</b></div></div>; }
