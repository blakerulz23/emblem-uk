'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import './preview.css';
import { CardFace } from '@/lib/card-definition';
import './badge.css';

const states = [
  ['create', 'Create Squad Invite'], ['approval', 'Awaiting staff approval'], ['staff', 'Staff approval'],
  ['publish', 'Publish and reusable link'], ['share', 'WhatsApp share preview'],
  ['board', 'Team gallery (parent landing)'], ['pricing', 'Pricing & affiliate details'], ['photo', 'Drop the photo'],
  ['save', 'Save & permissions'], ['done', 'Done — board updated'],
  ['resume', 'Returning parent'], ['closed', 'Closed/deadline'],
  ['pay-email', 'Payment request email'], ['pay-board', 'Board in payment mode'], ['pay-done', 'Payment confirmed'],
  ['dashboard', 'Organiser dashboard'], ['squad', 'Squad price unlocked'], ['coach-pending', 'Coach card pending'],
  ['coach-config', 'Coach card configuration'], ['fulfilment', 'Distribution view'], ['links', 'Link exception states'],
] as const;
type PreviewState = typeof states[number][0];

const deadline = new Date(Date.now() + 7 * 86400000);
const dateText = deadline.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const shipDate = new Date(Date.now() + 21 * 86400000).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
const payByText = new Date(Date.now() + 14 * 86400000).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });

/**
 * Organiser-seeded synthetic roster. First name + initial only — the same
 * information the team WhatsApp group already shares — no photos, contact
 * details or child metadata ever appear on the board.
 */
const POSITIONS = ['Midfielder', 'Defender', 'Striker', 'Goalkeeper', 'Winger'];
const ROSTER: Array<{ id: string; name: string; number: string; done: boolean }> = [
  { id: 'p1', name: 'Maya R.', number: '8', done: true },
  { id: 'p2', name: 'Alfie T.', number: '4', done: true },
  { id: 'p3', name: 'Zainab K.', number: '10', done: true },
  { id: 'p4', name: 'Noah B.', number: '1', done: true },
  { id: 'p5', name: 'Poppy L.', number: '7', done: true },
  { id: 'p6', name: 'Rio A.', number: '11', done: true },
  { id: 'p7', name: 'Ella G.', number: '5', done: true },
  { id: 'p8', name: 'Theo M.', number: '9', done: true },
  { id: 'p9', name: 'Oliver W.', number: '3', done: false },
  { id: 'p10', name: 'Amara D.', number: '6', done: false },
  { id: 'p11', name: 'Charlie H.', number: '2', done: false },
  { id: 'p12', name: 'Isla F.', number: '12', done: false },
  { id: 'p13', name: 'Kai P.', number: '14', done: false },
  { id: 'p14', name: 'Sofia N.', number: '15', done: false },
  { id: 'p15', name: 'Jude S.', number: '16', done: false },
];

function Pill({ children, tone = 'green' }: { children: React.ReactNode; tone?: 'green' | 'amber' | 'grey' | 'red' }) {
  return <span className={`si-pill ${tone}`}>{children}</span>;
}
function Metric({ value, label }: { value: string; label: string }) {
  return <div className="si-metric"><strong>{value}</strong><span>{label}</span></div>;
}
function PreviewNotice() {
  return <p className="si-preview-notice">Preview only — no payment will be taken.</p>;
}
function BrandHeader() {
  return <header className="si-brand"><span className="si-header-spacer" aria-hidden="true"/><div className="si-brand-lockup"><Image src="/embm-nav.png" width={108} height={32} style={{ height: 'auto' }} alt="Emblem"/><span>Squad Invite</span></div><span className="si-help-label">Help</span></header>;
}
function ClubBadge({ className = '' }: { className?: string }) {
  return <span className={`si-badge-crop ${className}`} role="img" aria-label="Ashton Juniors approved fictional badge"><Image src="/templates/hollinwood-red/club-badge-ashton.png" width={1024} height={1536} priority alt=""/></span>;
}
function ProductCard({ coach = false, generic = false, player, mini = false }: { coach?: boolean; generic?: boolean; player?: { name: string; number: string }; mini?: boolean }) {
  const initials = player ? player.name.split(' ').map(w => w[0]).join('').toUpperCase() : coach ? 'CJ' : generic ? '★' : 'MR';
  const name = player ? player.name.toUpperCase() : coach ? 'COACH JORDAN' : generic ? 'YOUR PLAYER' : 'MAYA R.';
  const detail = player ? `${player.number.padStart(2, '0')} · ASHTON JUNIORS` : coach ? 'HEAD COACH' : generic ? '00 · YOUR POSITION' : '08 · MIDFIELDER';
  const label = coach ? 'Coach card artwork' : generic ? 'Generic player card example with no child identity' : 'Synthetic private player card artwork';
  return <div className={`si-product-card${generic ? ' generic' : ''}${mini ? ' mini' : ''}`} aria-label={label}><div className="si-card-shine"/><ClubBadge className="si-card-badge"/><span className="si-card-kicker">ASHTON JUNIORS</span><div className="si-card-avatar" aria-hidden="true">{initials}</div><strong>{name}</strong><small>{detail}</small><b>EMBLEM</b></div>;
}

export default function SquadInvitePreview() {
  const [state, setState] = useState<PreviewState>(() => {
    // Deep-linkable reviewer state: /review/squad-invite?state=board opens
    // straight on that screen — handy when sharing a specific moment of
    // the journey for review.
    if (typeof window !== 'undefined') {
      const wanted = new URLSearchParams(window.location.search).get('state');
      if (wanted && states.some(([id]) => id === wanted)) return wanted as PreviewState;
    }
    return 'create';
  });
  const [linkCopied, setLinkCopied] = useState(false);
  // Parent-flow simulation: which roster player this parent picked, and
  // whether their card has been "completed" in this preview session.
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [justFinished, setJustFinished] = useState(false);
  const [justPaid, setJustPaid] = useState(false);
  const doneCount = ROSTER.filter((r) => r.done).length + (justFinished ? 1 : 0);
  const price = doneCount >= 10 ? '£18.99' : doneCount >= 2 ? '£21.99' : '£24.99';
  const toSquad = Math.max(0, 10 - doneCount);
  const picked = ROSTER.find((r) => r.id === pickedId) ?? null;
  const index = states.findIndex(([id]) => id === state);
  const go = (offset: number) => setState(states[(index + offset + states.length) % states.length][0]);
  const reviewerAction = (label: string, next: PreviewState) => <button className="si-reviewer-action" onClick={() => setState(next)}><span>Reviewer control</span>{label} →</button>;

  const screen = useMemo(() => {
    switch (state) {
      case 'create': return <><Hero eyebrow="Organiser setup" title="Create a Squad Invite" copy="One team link. Each parent creates their child’s card individually. Parents pay after the team price is confirmed."/><CreationFields/><Check text="I am an adult authorised to create and share this Squad Invite."/><button className="si-primary" onClick={() => setState('board')}>Create Squad Invite <span>→</span></button><p className="si-help">Your invite page opens immediately, ready to share. Emblem’s safety review runs in the background — sharing is paused only if something needs a second look.</p></>;
      case 'approval': return <><Hero eyebrow="Draft saved" title="Waiting for Emblem review" copy="The invitation cannot be shared until an authorised staff member approves it."/><StatusSteps active={1}/><Pill tone="amber">Awaiting staff approval</Pill>{reviewerAction('Open staff review', 'staff')}</>;
      case 'staff': return <><Hero eyebrow="Controlled pilot safeguard" title="Review Squad Invite" copy="A lightweight staff check before the organiser can share the invitation."/><StaffChecklist/><div className="si-actions"><button className="si-secondary" onClick={() => setState('approval')}>Return for changes</button><button className="si-primary" onClick={() => setState('publish')}>Approve Squad Invite</button></div></>;
      case 'publish': return <><Hero eyebrow="Approved" title="Squad Invite link ready" copy="Share one link in the existing parent WhatsApp group. It contains no child or parent information."/><div className="si-link-ready"><span className="si-icon">✓</span><div><strong>Reusable invitation link created</strong><span>Credential details stay hidden from the organiser view.</span></div></div><div className="si-actions"><button className="si-secondary" onClick={() => setLinkCopied(true)}>{linkCopied ? 'Link copied' : 'Copy link'}</button><button className="si-primary" onClick={() => setState('share')}>Share to WhatsApp</button></div><div className="si-quiet-actions"><button onClick={() => setState('links')}>Pause invitation</button><button onClick={() => setState('links')}>Replace link</button></div></>;
      case 'share': return <><Hero eyebrow="WhatsApp preview" title="Ready to share" copy="No contacts or group membership are sent to Emblem."/><div className="si-phone"><div className="si-phone-top">Ashton Juniors parents <span>•••</span></div><div className="si-message"><b>Coach Jordan</b><p>Ashton Juniors U10 has opened an Emblem Squad Invite. Create your child’s personalised sporting card privately by {dateText}. Participation is optional. Create your card now and pay after the team price is confirmed.</p><div className="si-share-card"><ClubBadge/><span><b>Join Ashton Juniors U10</b><small>2 more completed cards unlock £18.99 · One team delivery</small></span></div></div></div>{reviewerAction('Preview parent opening link', 'board')}</>;
      case 'board': return <><div className="si-invite-hero"><div><ClubBadge className="si-club-badge"/><Hero eyebrow="Ashton Juniors · Under 10" title="The team’s cards are coming together" copy="Nobody pays until the invitation closes — every card made brings the price down for the whole team."/></div></div><CardGallery highlightNew={justFinished}/><PriceLadder done={doneCount} price={price} toSquad={toSquad} onLearnMore={() => setState('pricing')}/><div className="si-grid"><Metric value={dateText} label="invitation closes"/><Metric value={`~${shipDate}`} label="estimated delivery"/></div><PreviewNotice/><button className="si-primary" onClick={() => setState('photo')}>Make yours now too <span>→</span></button><div className="si-actions"><button className="si-secondary" onClick={() => setLinkCopied(true)}>{linkCopied ? 'Link copied ✓' : 'Copy team link'}</button><button className="si-secondary" onClick={() => setState('share')}>Share to WhatsApp</button></div><p className="si-help">Anyone with this link lands right here — the more parents see the board, the faster the price drops.</p></>;
      case 'resume': return <><Hero eyebrow="Welcome back" title="Resume your player’s card" copy="We found your saved card from this invitation. Pick up exactly where you left off."/><Pill>Card resumed</Pill><button className="si-primary" onClick={() => setState('photo')}>Continue card <span>→</span></button></>;
      case 'pricing': return <><Hero eyebrow="How team pricing works" title="More cards, lower price — for everyone" copy="One price per card, decided by how many the team completes before the invitation closes. Nobody pays until the final price is confirmed."/><div className="si-tiertable" role="table" aria-label="Price tiers"><div role="row" className="si-tier"><b>1 card</b><span>Single</span><strong>£24.99</strong></div><div role="row" className="si-tier active"><b>2–9 cards</b><span>Multi</span><strong>£21.99</strong></div><div role="row" className="si-tier"><b>10+ cards</b><span>Squad — unlocks a free coach card</span><strong>£18.99</strong></div></div><p className="si-help">The final tier is set by completed cards at close. Because payment happens after close, early families always pay the same as everyone else — being first never costs more.</p><div className="si-trust"><b>Want to bring Emblem to more teams?</b><span>Organisers who run a successful Squad Invite can join our affiliate programme — earn a commission for every squad you bring, with a shareable link and a simple dashboard. <a className="si-mailto" href="mailto:hello@emblem.cards?subject=Emblem%20affiliate%20programme">Email us to find out more</a>.</span></div><button className="si-secondary" onClick={() => setState('board')}>Back to the team</button></>;
      case 'photo': return <><Hero eyebrow="Step 1 of 2" title="Drop their football photo" copy="One clear photo of your player. We handle the cutout, the card design and the print."/><button className="si-photodrop" type="button" onClick={() => setState('save')}><span aria-hidden="true">📷</span><b>Tap to add a photo</b><small>or drag one here · Synthetic preview — no photo is uploaded</small></button><div className="si-builder-layout"><ProductCard generic/><div className="si-rows"><div>Ashton Juniors U10 · club template</div><div>Name and number added at save</div><div>Design matches the team’s cards</div></div></div><button className="si-primary" onClick={() => setState('save')}>Looks good <span>→</span></button></>;
      case 'save': return <><Hero eyebrow="Step 2 of 2" title="Save the card" copy="Their name and number, an email so you can come back, and four quick confirmations. That’s everything."/><div className="si-two-fields"><label className="si-field">Player’s first name<input defaultValue="Oliver W."/></label><label className="si-field">Squad number<input defaultValue="3" inputMode="numeric"/></label></div><label className="si-field">Email address<input defaultValue="alex.taylor@example.test" type="email"/></label><div className="si-permissions"><Check text="I am the child’s parent/guardian or have permission to submit their details."/><Check text="I have permission to use this photograph on the printed card."/><Check text="I understand the cards will be delivered together to Coach Jordan."/><Check text="I understand I am not paying today. I’ll get one payment request at the final team price after the invitation closes."/></div><button className="si-primary" onClick={() => { setPickedId('p9'); setJustFinished(true); setState('done'); }}>Save my player’s card <span>→</span></button></>;
      case 'done': return <><div className="si-success-mark">✓</div><Hero eyebrow="Card completed" title="Oliver’s card is on the board" copy={`Nothing to pay today. ${toSquad > 0 ? `${toSquad} more card${toSquad === 1 ? '' : 's'} and the whole team drops to £18.99 — including yours.` : 'Squad price locked at £18.99 for everyone.'}`}/><CardGallery highlightNew/><PriceLadder done={doneCount} price={price} toSquad={toSquad}/><div className="si-actions"><button className="si-primary" onClick={() => setState('share')}>Nudge the team on WhatsApp</button><button className="si-secondary" onClick={() => setState('board')}>Back to the team</button></div></>;
      case 'closed': return <><Hero eyebrow="Invitation closed" title="New card starts are closed" copy="Parents who began before the deadline may finish their card during the 24-hour grace period. Then the team price is confirmed and payment requests go out."/><Pill tone="grey">Team price confirms after grace</Pill><Progress/><PreviewNotice/>{reviewerAction('Preview the payment request', 'pay-email')}</>;
      case 'pay-email': return <><Hero eyebrow="After close · Model 3" title="One payment request" copy="When the invitation closes, every parent with a completed card receives one email at the final confirmed team price."/><div className="si-phone"><div className="si-phone-top">Emblem <span>to alex.taylor@example.test</span></div><div className="si-message"><b>Team price confirmed: £18.99 per card</b><p>Ashton Juniors U10 finished with 10 completed cards, so everyone pays the squad price — £18.99. Pay for Maya’s card by {payByText} using your team link. Cards go to print once the team’s payments are in.</p><div className="si-share-card"><ClubBadge/><span><b>Pay for Maya’s card — £18.99</b><small>Opens your team board · secure Shopify checkout</small></span></div></div></div><p className="si-help">One email, one price, one link — the same board link the parent already knows. A single reminder is sent before the payment deadline.</p>{reviewerAction('Open the board in payment mode', 'pay-board')}</>;
      case 'pay-board': return <><div className="si-invite-hero"><div><ClubBadge className="si-club-badge"/><Hero eyebrow="Ashton Juniors · Under 10" title="Team price locked: £18.99" copy={`Every completed card pays the same. Unpaid cards are not printed — pay by ${payByText}.`}/></div></div><div className="si-grid"><Metric value="£18.99" label="confirmed price per card"/><Metric value={justPaid ? '7 of 10' : '6 of 10'} label="cards paid"/></div><progress className="si-native-progress" value={justPaid ? 7 : 6} max="10" aria-label="Cards paid so far">6 of 10</progress><div className="si-roster" role="list" aria-label="Payment progress">{ROSTER.filter(r => r.done || r.id === pickedId).map((r) => { const mine = r.id === pickedId; const paid = ['p1','p2','p3','p4','p5','p6'].includes(r.id) || (mine && justPaid); return <div key={r.id} role="listitem" className={`si-roster-row${paid ? ' done' : ''}`}><span className="si-roster-check" aria-hidden="true">{paid ? '✓' : ''}</span><span className="si-roster-name">{r.name}</span><span className="si-roster-number">No. {r.number}</span>{mine && !paid ? <button type="button" className="si-pay-btn" onClick={() => { setJustPaid(true); setState('pay-done'); }}>Pay £18.99</button> : <span className="si-roster-status">{paid ? 'Paid' : 'Awaiting payment'}</span>}</div>; })}</div><p className="si-help">Implementation note for review: the Pay button opens the existing Shopify cart permalink for the £18.99 tier variant with this order’s reference as a cart attribute — the identical HMAC-verified orders/paid webhook rails already live in production flip the row to Paid. No Draft Orders, no deferred capture, no refunds.</p></>;
      case 'pay-done': return <><div className="si-success-mark">✓</div><Hero eyebrow="Payment confirmed" title={`${picked ? picked.name : 'Maya R.'} is paid and going to print`} copy="That’s everything. Cards print once the team’s payments are in, then arrive together in one package for your organiser to hand out."/><div className="si-grid"><Metric value="£18.99" label="paid — squad price"/><Metric value={`~${shipDate}`} label="estimated delivery"/></div><Delivery detail="Individually sealed for private hand-out at training."/><div className="si-actions"><button className="si-primary" onClick={() => setState('pay-board')}>Back to the team board</button></div>{reviewerAction('Preview organiser dashboard', 'dashboard')}</>;
      case 'dashboard': return <><Hero eyebrow="Organiser dashboard" title="Ashton Juniors U10" copy="Aggregate progress only. No parent list, payment details or child photographs."/><div className="si-dashboard-strip"><div><span>Progress to squad price</span><strong>8 of 10</strong></div><div className="si-ring" aria-label="80 percent of squad-price target completed">80%</div></div><progress className="si-native-progress" value="8" max="10" aria-label="8 of 10 cards completed for squad price">8 of 10</progress><div className="si-grid"><Metric value="8" label="completed cards"/><Metric value="10" label="squad-price target"/><Metric value="15" label="estimated squad size"/><Metric value="£21.99" label="current price"/></div><div className="si-milestones"><b>Squad price: 2 more completed cards needed</b><span>Free coach card: Confirmed after 10 parents pay</span></div><StatusSteps active={2}/><Delivery organiser/>{reviewerAction('Preview 10 completed cards', 'squad')}</>;
      case 'squad': return <><div className="si-celebrate">SQUAD PRICE UNLOCKED</div><Hero eyebrow="Team price confirmed" title="£18.99 per card" copy="Ten distinct completed eligible cards freeze the squad price."/><div className="si-grid"><Metric value="10" label="completed cards"/><Metric value="£18.99" label="confirmed unit price"/></div><div className="si-milestones"><b>Squad price unlocked: £18.99 per card</b><span>Free coach card: Waiting for 10 successful payments</span></div><PreviewNotice/></>;
      case 'coach-pending': return <><div className="si-coach-layout"><ProductCard coach/><div><Hero eyebrow="Separate milestone" title="Free coach card pending" copy="In the future live product, the free coach card is confirmed after ten successful, non-refunded player payments."/><div className="si-grid"><Metric value="10" label="completed cards"/><Metric value="Not active" label="payment requests in preview"/></div><Pill tone="amber">Waiting for 10 successful payments</Pill></div></div></>;
      case 'coach-config': return <><Hero eyebrow="Adult card · proposed" title="Configure coach card" copy="This card never creates a child profile or Player OS account."/><div className="si-builder-layout"><ProductCard coach/><FormRows rows={['Coach Jordan', 'Role: Head coach', 'Team: Ashton Juniors U10', 'Design: Emblem black']}/></div><Pill tone="amber">Synthetic configuration · not production eligible</Pill>{reviewerAction('Preview fulfilment view', 'fulfilment')}</>;
      case 'fulfilment': return <><Hero eyebrow="Consolidated fulfilment" title="One team package" copy="One standard UK team delivery is included. Paid cards are individually sealed for private distribution."/><div className="si-box-visual"><b>EMBLEM</b><span>ASHTON JUNIORS U10</span><small>15 sealed card envelopes · one organiser delivery</small></div><div className="si-package"><b>Package SI-014</b><span>For the parent/guardian of Maya R. — No. 8</span><Pill>Sealed</Pill></div><p className="si-help">No email, phone, address, permission record, internal child ID or NFC claim secret appears here.</p></>;
      case 'links': return <><Hero eyebrow="Reusable link controls" title="This invitation is unavailable" copy="Invalid, expired, paused and revoked links use the same privacy-preserving response."/><div className="si-unavailable">Link unavailable</div><div className="si-link-grid">{[['Invalid', 'Unavailable'], ['Expired', 'Unavailable'], ['Paused', 'Unavailable'], ['Revoked', 'Unavailable'], ['Replaced', 'Old link unavailable']].map(([a, b]) => <div key={a}><b>{a} link</b><span>{b}</span></div>)}</div><button className="si-secondary" onClick={() => setState('publish')}>Replace shared link</button><p className="si-help">Existing private cards survive replacement without retaining public-link authority.</p></>;
    }
  }, [state, linkCopied, pickedId, justFinished, justPaid, doneCount, price, toSquad, picked]);

  return <main className="si-preview"><div className="si-shell"><div className="si-preview-bar"><b>Synthetic product preview</b><span>· No database · No payments · No real child data</span></div><aside className="si-reviewer-nav" aria-label="Reviewer navigation — synthetic preview only"><strong>Reviewer navigation — synthetic preview only</strong><div><button onClick={() => go(-1)} aria-label="Previous synthetic preview state">←</button><select value={state} onChange={(e) => setState(e.target.value as PreviewState)} aria-label="Choose synthetic preview state">{states.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select><button onClick={() => go(1)} aria-label="Next synthetic preview state">→</button></div></aside><div className="si-product-surface"><BrandHeader/><section className="si-screen" aria-label={states[index][1]}>{screen}</section><footer className="si-footer"><span className="si-footer-identity">© Emblem</span><span>Privacy</span><span>Safety</span><span>Support</span></footer></div></div></main>;
}

/**
 * The team board — the heart of the flow. Organiser-seeded roster with a
 * checkmark per completed card. First name + initial and squad number only:
 * exactly the information the team WhatsApp group already has. No photos,
 * no parent identity, no contact details, gated behind the invitation link.
 */
function Roster({ pickMode = false, selectedId = null, finishedId = null, onPick }: { pickMode?: boolean; selectedId?: string | null; finishedId?: string | null; onPick?: (id: string) => void }) {
  return <div className="si-roster" role="list" aria-label={pickMode ? 'Choose your player' : 'Team card progress'}>
    {ROSTER.map((r) => {
      const done = r.done || r.id === finishedId;
      const clickable = pickMode && !done && onPick;
      return <button key={r.id} role="listitem" type="button" disabled={!clickable} onClick={clickable ? () => onPick(r.id) : undefined}
        className={`si-roster-row${done ? ' done' : ''}${r.id === selectedId ? ' selected' : ''}${clickable ? ' pickable' : ''}`}>
        <span className="si-roster-check" aria-hidden="true">{done ? '✓' : ''}</span>
        <span className="si-roster-name">{r.name}</span>
        <span className="si-roster-number">No. {r.number}</span>
        <span className="si-roster-status">{done ? 'Card done' : pickMode ? 'Tap to start' : 'Waiting'}</span>
      </button>;
    })}
  </div>;
}

/**
 * The team gallery — the landing hook. A horizontal scroll of the cards
 * teammates have already made ("look how good Maya's card is") rendered
 * with the same synthetic initials treatment as the rest of the preview:
 * no real photographs, first name + initial and squad number only, gated
 * behind the invitation link.
 */
function CardGallery({ highlightNew = false }: { highlightNew?: boolean }) {
  const doneCards = ROSTER.filter((r) => r.done);
  const face = (r: { name: string; number: string }, i: number) => (
    <CardFace
      side="front"
      size={126}
      photoUrl="/templates/emjfl-orange/default-player-clean.png"
      data={{
        templateId: 'hollinwood-red',
        sport: 'soccer',
        name: r.name,
        number: r.number,
        team: 'Ashton Juniors',
        position: POSITIONS[i % POSITIONS.length],
        logo: null,
        photoCrop: null,
        stats: null,
      }}
    />
  );
  return <div className="si-gallery-wrap"><div className="si-gallery" role="list" aria-label="Cards the team has already made">
    {highlightNew && <div role="listitem" className="si-gallery-item yours">{face({ name: 'Oliver W.', number: '3' }, 2)}<span className="si-gallery-tag">Yours ✓</span></div>}
    {doneCards.map((r, i) => <div key={r.id} role="listitem" className="si-gallery-item">{face(r, i)}<span className="si-gallery-name">{r.name}</span></div>)}
    <div role="listitem" className="si-gallery-item ghost"><div className="si-gallery-ghostcard"><span aria-hidden="true">＋</span><b>This could be yours</b></div></div>
  </div><p className="si-gallery-count">{doneCards.length + (highlightNew ? 1 : 0)} cards made so far · rendered by the same builder parents use · scroll to see the team</p></div>;
}

/** Price ladder: where the team price stands and what the next unlock is. */
function PriceLadder({ done, price, toSquad, onLearnMore }: { done: number; price: string; toSquad: number; onLearnMore?: () => void }) {
  return <div className="si-priceladder">
    <div className="si-grid"><Metric value={`${done} of 10`} label="cards completed"/><Metric value={price} label="current team price"/></div>
    <progress className="si-native-progress" value={Math.min(done, 10)} max="10" aria-label={`${done} of 10 cards completed for squad price`}>{done} of 10</progress>
    <p className="si-progress-copy">{toSquad > 0 ? `${toSquad} more completed card${toSquad === 1 ? '' : 's'} unlock £18.99 for the whole team — nobody pays until the invitation closes, so everyone gets the final price.` : 'Squad price locked: £18.99 per card for everyone.'}</p>
    {onLearnMore && <button type="button" className="si-learnmore" onClick={onLearnMore}>How team pricing works →</button>}
  </div>;
}

function Hero({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) { return <header className="si-header"><span>{eyebrow}</span><h1>{title}</h1><p>{copy}</p></header>; }
function FormRows({ rows }: { rows: string[] }) { return <div className="si-rows">{rows.map((row) => <div key={row}>{row}</div>)}</div>; }
function Check({ text }: { text: string }) { return <label className="si-check"><input type="checkbox" defaultChecked/><span>{text}</span></label>; }
function Delivery({ detail = 'Paid cards arrive in one team package for Coach Jordan to distribute to participating families.', organiser = false }: { detail?: string; organiser?: boolean }) { return <div className="si-delivery"><span className="si-icon">↗</span><div><b>{organiser ? 'One standard UK team delivery is included' : 'Delivered together to your organiser'}</b><span>{detail}</span></div></div>; }
function Progress() { return <><div className="si-grid"><Metric value="8 of 10" label="cards completed"/><Metric value="£21.99" label="current price"/></div><progress className="si-native-progress" value="8" max="10" aria-label="8 of 10 cards completed for squad price">8 of 10</progress><p className="si-progress-copy">2 more completed cards unlock the £18.99 squad price</p><Pill tone="amber">Free coach card confirmed after 10 parents pay</Pill></>; }
function StatusSteps({ active }: { active: number }) { return <div className="si-steps">{['Created', 'Staff approval', 'Shared', 'Closed'].map((x, i) => <span className={i <= active ? 'done' : ''} key={x}>{x}</span>)}</div>; }
function CreationFields() { return <div className="si-form-grid"><label>Team<input defaultValue="Ashton Juniors U10"/></label><label>Age group<input defaultValue="Under 10"/></label><label>Organiser<input defaultValue="Coach Jordan"/></label><label>Invitation deadline<input defaultValue={dateText}/></label><label>Estimated squad size<input defaultValue="15" inputMode="numeric"/></label></div>; }
function BuilderControls() { return <div className="si-builder-controls"><button className="si-upload" type="button"><span aria-hidden="true">＋</span><b>Upload or replace photograph</b><small>Synthetic preview only</small></button><label>Display name<input defaultValue="Maya Reed"/></label><div className="si-two-fields"><label>Squad number<input defaultValue="8"/></label><label>Quantity<input defaultValue="1"/></label></div><label>Position<select defaultValue="Midfielder"><option>Midfielder</option><option>Goalkeeper</option><option>Defender</option><option>Forward</option></select></label><label>Card design<select defaultValue="Emblem black"><option>Emblem black</option><option>Club colour</option></select></label></div>; }
function StaffChecklist() { return <div className="si-staff-checklist">{['Organiser declaration received', 'Team and club identity appears credible', 'Badge-use authority recorded or pending', 'Delivery recipient provided', 'Deadline is reasonable', 'Duplicate campaign check completed', 'No child roster uploaded'].map((item) => <div key={item}><span aria-hidden="true">✓</span>{item}</div>)}</div>; }
