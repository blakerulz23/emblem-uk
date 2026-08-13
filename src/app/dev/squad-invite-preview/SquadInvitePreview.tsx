'use client';

import { useMemo, useState } from 'react';
import './preview.css';

const states = [
  ['create','Create Squad Invite'],['approval','Awaiting staff approval'],['staff','Staff approval'],
  ['publish','Publish and reusable link'],['share','WhatsApp share preview'],['invite','Parent invitation'],
  ['verify','New parent verification'],['resume','Returning parent'],['builder','One-child builder'],
  ['permissions','Permissions'],['committed','Commitment confirmation'],['closed','Closed/deadline'],
  ['dashboard','Organiser dashboard'],['squad','Squad price unlocked'],['coach-pending','Coach card pending'],
  ['coach-config','Coach card configuration'],['fulfilment','Distribution view'],['links','Link exception states'],
] as const;
type PreviewState = typeof states[number][0];

const deadline = new Date(Date.now() + 7 * 86400000);
const dateText = deadline.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

function Pill({ children, tone='green' }: { children: React.ReactNode; tone?: 'green'|'amber'|'grey'|'red' }) {
  return <span className={`si-pill ${tone}`}>{children}</span>;
}
function Metric({ value, label }: { value: string; label: string }) {
  return <div className="si-metric"><strong>{value}</strong><span>{label}</span></div>;
}
function Notice() {
  return <div className="si-notice"><strong>Payment requests are not active</strong><span>This preview never charges anyone or contacts Shopify.</span></div>;
}

export default function SquadInvitePreview() {
  const [state, setState] = useState<PreviewState>('create');
  const index = states.findIndex(([id]) => id === state);
  const title = states[index][1];
  const invitationPath = '/squad-invite/join/••••••••••••••••';
  const go = (offset: number) => setState(states[(index + offset + states.length) % states.length][0]);
  const screen = useMemo(() => {
    switch (state) {
      case 'create': return <><Header eyebrow="Organiser setup" title="Create a Squad Invite" copy="One link for the parent WhatsApp group. Each parent privately creates one child’s card."/><FormRows rows={['Ashton Juniors U10','Under 10','Coach Jordan',dateText,'Expected: 15 parents']}/><Check text="I am an adult authorised to create and share this Squad Invite."/><button className="si-primary" onClick={() => setState('approval')}>Send for staff approval</button></>;
      case 'approval': return <><Header eyebrow="Draft saved" title="Waiting for Emblem review" copy="The invitation cannot be shared until an authorised staff member approves it."/><StatusSteps active={1}/><Pill tone="amber">Awaiting staff approval</Pill><Notice/><button className="si-primary" onClick={() => setState('staff')}>Open staff review</button></>;
      case 'staff': return <><Header eyebrow="Staff control" title="Review campaign" copy="Confirm the declared organiser, team-delivery recipient and campaign deadline."/><Review/><div className="si-actions"><button className="si-secondary">Return to organiser</button><button className="si-primary" onClick={() => setState('publish')}>Approve campaign</button></div></>;
      case 'publish': return <><Header eyebrow="Approved" title="Your reusable invitation link is ready" copy="Share this link in the existing parent WhatsApp group. It contains no child or parent information."/><div className="si-link"><code>{invitationPath}</code><button>Copy</button></div><div className="si-actions"><button className="si-secondary">Pause link</button><button className="si-primary" onClick={() => setState('share')}>Share invitation</button></div></>;
      case 'share': return <><Header eyebrow="WhatsApp preview" title="Ready to share" copy="No contacts or group membership are sent to Emblem."/><div className="si-message"><b>Coach Jordan</b><p>Ashton Juniors U10 has opened an Emblem Squad Invite. Each parent can independently create their child’s personalised sporting card by {dateText}. Participation is optional. If 10 players join, the squad price is unlocked.</p><span>{invitationPath}</span></div><button className="si-primary" onClick={() => setState('invite')}>Preview parent opening link</button></>;
      case 'invite': return <><Header eyebrow="Ashton Juniors U10 · Under 10" title="Create your child’s card for this team order" copy="One team link. Each parent builds and pays individually."/><Progress/><p>Your child’s information is submitted privately to Emblem. No participant list or child photograph appears here.</p><Delivery/><Notice/><button className="si-primary" onClick={() => setState('verify')}>Join this Squad Invite</button></>;
      case 'verify': return <><Header eyebrow="Private parent session" title="Verify your email" copy="We’ll send a one-time code so you can return safely to this campaign."/><label className="si-field">Email address<input defaultValue="alex.taylor@example.test" type="email"/></label><button className="si-primary" onClick={() => setState('builder')}>Send verification code</button><button className="si-text" onClick={() => setState('resume')}>Preview returning parent instead</button></>;
      case 'resume': return <><Header eyebrow="Welcome back" title="Resume your private card" copy="Your existing participation was found. The shared invitation link does not expose this builder."/><Pill>Private participation resumed</Pill><button className="si-primary" onClick={() => setState('builder')}>Continue card</button></>;
      case 'builder': return <><Header eyebrow="Private builder · Step 2 of 4" title="Design one child’s card" copy="This information is not visible to Coach Jordan or other parents."/><div className="si-card"><div className="si-avatar">MR</div><strong>Maya R.</strong><span>Ashton Juniors · No. 8 · Midfielder</span></div><FormRows rows={['Display name: Maya Reed','Squad number: 8','Position: Midfielder','Quantity: 1']}/><p className="si-help">Synthetic placeholder only. No real photograph is used.</p><button className="si-primary" onClick={() => setState('permissions')}>Review permissions</button></>;
      case 'permissions': return <><Header eyebrow="Separate acknowledgements" title="Your choices" copy="Required permissions are recorded separately and are not marketing consent."/><Check text="I have authority to submit this child’s information."/><Check text="I authorise the photograph for card manufacture."/><Check text="I understand this is consolidated team delivery."/><Check text="I understand this is a payment-neutral commitment."/><div className="si-check muted"><input type="checkbox" disabled/><span>Private registration — deferred until after the pilot</span></div><button className="si-primary" onClick={() => setState('committed')}>Complete commitment</button></>;
      case 'committed': return <><Header eyebrow="Commitment completed" title="You have not been charged" copy="When the invitation closes, Emblem will confirm the final group price and send an individual payment request."/><Pill>Card commitment saved</Pill><Notice/><Delivery/><button className="si-primary" onClick={() => setState('dashboard')}>Return to preview journey</button></>;
      case 'closed': return <><Header eyebrow="Campaign closed" title="New card starts are closed" copy="Parents who began before the deadline may complete during the 24-hour grace period."/><Pill tone="grey">Pricing finalises after grace</Pill><Progress/><Notice/></>;
      case 'dashboard': return <><Header eyebrow="Organiser dashboard" title="Ashton Juniors U10" copy="Aggregate progress only. No parent list, payment details or child photographs."/><div className="si-grid"><Metric value="8" label="completed commitments"/><Metric value="£21.99" label="current card price"/><Metric value="2" label="needed for squad price"/><Metric value="Locked" label="free coach card"/></div><StatusSteps active={2}/><Delivery/><button className="si-primary" onClick={() => setState('squad')}>Preview 10 commitments</button></>;
      case 'squad': return <><Header eyebrow="Pricing finalised" title="Squad price unlocked" copy="Ten completed commitments freeze the £18.99 unit price. Commitments are not payments."/><div className="si-grid"><Metric value="10" label="completed commitments"/><Metric value="£18.99" label="frozen unit price"/></div><Pill>Squad price unlocked</Pill><Pill tone="amber">Free coach card not confirmed</Pill><Notice/></>;
      case 'coach-pending': return <><Header eyebrow="Separate qualification" title="Free coach card pending" copy="The squad price follows completed commitments. The free coach card requires ten successfully paid player orders."/><div className="si-grid"><Metric value="10" label="commitments"/><Metric value="8" label="payments confirmed"/></div><Pill tone="amber">2 payments still required</Pill></>;
      case 'coach-config': return <><Header eyebrow="Adult card · proposed" title="Configure coach card" copy="This card never creates a child profile or Player OS account."/><FormRows rows={['Coach Jordan','Role: Head coach','Team: Ashton Juniors U10','Design: Forest Green']}/><Pill tone="amber">Saved · not production eligible</Pill><button className="si-primary">Save configuration</button></>;
      case 'fulfilment': return <><Header eyebrow="Minimal distribution" title="Team package" copy="One standard UK delivery to Coach Jordan. Each card is individually sealed."/><div className="si-package"><b>Package SI-014</b><span>For the parent/guardian of Maya R. — No. 8</span><Pill>Sealed</Pill></div><div className="si-package"><b>Package SI-015</b><span>Staff-reviewed label exception</span><Pill tone="amber">Review</Pill></div><p className="si-help">No email, phone, address, consent record, internal child ID or NFC claim secret appears here.</p></>;
      case 'links': return <><Header eyebrow="Reusable link controls" title="Invitation-link states" copy="Existing private participations survive every public-link state below."/><div className="si-link-grid">{[['Invalid','Unavailable'],['Expired','Unavailable'],['Paused','Unavailable'],['Revoked','Unavailable']].map(([a,b])=><button key={a}><b>{a} link</b><span>{b}</span></button>)}</div><button className="si-secondary">Replace shared link</button><p className="si-help">Replacement revokes the old credential without deleting the campaign or private builders.</p></>;
    }
  }, [state]);

  return <main className="si-preview"><div className="si-shell"><div className="si-preview-bar"><b>Synthetic local preview</b><span>No database · no Shopify · no real child data</span></div><nav className="si-switcher" aria-label="Preview state"><button onClick={() => go(-1)} aria-label="Previous state">←</button><select value={state} onChange={(e) => setState(e.target.value as PreviewState)}>{states.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select><button onClick={() => go(1)} aria-label="Next state">→</button></nav><section className="si-screen" aria-label={title}>{screen}</section></div></main>;
}

function Header({ eyebrow,title,copy }: { eyebrow:string; title:string; copy:string }) { return <header className="si-header"><span>{eyebrow}</span><h1>{title}</h1><p>{copy}</p></header>; }
function FormRows({ rows }: { rows:string[] }) { return <div className="si-rows">{rows.map((row)=><div key={row}>{row}<span>›</span></div>)}</div>; }
function Check({ text }: { text:string }) { return <label className="si-check"><input type="checkbox" defaultChecked/><span>{text}</span></label>; }
function Delivery() { return <div className="si-delivery"><b>One team delivery</b><span>Cards are delivered together to Coach Jordan for distribution to participating families.</span></div>; }
function Progress() { return <><div className="si-grid"><Metric value="8" label="completed commitments"/><Metric value="£21.99" label="current price"/></div><div className="si-progress"><i/><span>2 more commitments unlock £18.99</span></div><Pill tone="amber">Free coach card not yet confirmed</Pill></>; }
function StatusSteps({ active }: { active:number }) { return <div className="si-steps">{['Created','Staff approval','Shared','Closed'].map((x,i)=><span className={i<=active?'done':''} key={x}>{x}</span>)}</div>; }
function Review() { return <div className="si-rows"><div>Team <b>Ashton Juniors U10</b></div><div>Organiser <b>Coach Jordan</b></div><div>Deadline <b>{dateText}</b></div><div>Delivery <b>One organiser shipment</b></div></div>; }
