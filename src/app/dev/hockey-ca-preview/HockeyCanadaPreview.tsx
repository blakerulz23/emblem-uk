'use client';

/**
 * Emblem Canada Hockey — synthetic product preview.
 *
 * A concept port of the Squad Invite board-first flow to Canadian minor
 * hockey, built as ADR-7's "second-sport test" made concrete: every
 * screen reuses the same primitives (campaign, participation, tiered
 * team pricing, payment-after-close) with only the sport-specific layer
 * swapped. Findings from the port live in
 * docs/architecture/emblem-ca-hockey-second-sport-test.md.
 *
 * Synthetic only: no database, no payments, no real child data. Names,
 * association and league are fictional. The card design is a CSS concept
 * (no hockey template asset exists yet — that is a recorded finding, not
 * an oversight).
 */

import { useMemo, useState } from 'react';
import './hockey.css';

const states = [
  ['create', 'Create a Team Invite'],
  ['board', 'Team gallery (parent landing)'],
  ['pricing', 'Pricing & affiliate details'],
  ['photo', 'Drop the photo'],
  ['save', 'Save & permissions'],
  ['done', 'Done — board updated'],
  ['share', 'Group chat share preview'],
  ['closed', 'Closed/deadline'],
  ['pay-email', 'Payment request email'],
  ['pay-board', 'Board in payment mode'],
  ['pay-done', 'Payment confirmed'],
] as const;
type PreviewState = typeof states[number][0];

const deadline = new Date(Date.now() + 7 * 86400000).toLocaleDateString('en-CA', { day: 'numeric', month: 'long' });
const shipDate = new Date(Date.now() + 21 * 86400000).toLocaleDateString('en-CA', { day: 'numeric', month: 'long' });
const payBy = new Date(Date.now() + 14 * 86400000).toLocaleDateString('en-CA', { day: 'numeric', month: 'long' });

/**
 * Hockey sport config — the layer ADR-7 says should be the ONLY thing
 * that changes per sport. Positions and stat labels are real minor-
 * hockey vocabulary; goalies get their own stat set.
 */
const HOCKEY = {
  positions: ['Goalie', 'Defence', 'Left Wing', 'Centre', 'Right Wing'],
  skaterStats: ['GP', 'G', 'A', 'P'],
  goalieStats: ['GP', 'SV%', 'GAA'],
  // CAD tier pricing mirrors the UK engine's single/multi/squad shape.
  tiers: { single: '$42.99', multi: '$37.99', squad: '$32.99' },
  squadTarget: 12, // hockey rosters run 15–19; squad tier at 12 distinct cards
};

/** Fictional roster — first name + initial only, association-seeded. */
const ROSTER: Array<{ id: string; name: string; number: string; position: string; done: boolean }> = [
  { id: 'h1', name: 'Liam T.', number: '9', position: 'Centre', done: true },
  { id: 'h2', name: 'Emma B.', number: '31', position: 'Goalie', done: true },
  { id: 'h3', name: 'Noah D.', number: '4', position: 'Defence', done: true },
  { id: 'h4', name: 'Olivia M.', number: '17', position: 'Left Wing', done: true },
  { id: 'h5', name: 'Lucas G.', number: '22', position: 'Right Wing', done: true },
  { id: 'h6', name: 'Sophie R.', number: '7', position: 'Centre', done: true },
  { id: 'h7', name: 'Ethan K.', number: '2', position: 'Defence', done: true },
  { id: 'h8', name: 'Chloe L.', number: '14', position: 'Left Wing', done: true },
  { id: 'h9', name: 'Mason P.', number: '19', position: 'Right Wing', done: true },
  { id: 'h10', name: 'Ava S.', number: '5', position: 'Defence', done: false },
  { id: 'h11', name: 'Jack W.', number: '11', position: 'Centre', done: false },
  { id: 'h12', name: 'Zoe C.', number: '30', position: 'Goalie', done: false },
  { id: 'h13', name: 'Owen F.', number: '8', position: 'Left Wing', done: false },
  { id: 'h14', name: 'Mia N.', number: '21', position: 'Right Wing', done: false },
  { id: 'h15', name: 'Leo V.', number: '6', position: 'Defence', done: false },
  { id: 'h16', name: 'Ruby H.', number: '13', position: 'Centre', done: false },
  { id: 'h17', name: 'Felix A.', number: '18', position: 'Left Wing', done: false },
];

function Hero({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return <header className="hk-header"><span>{eyebrow}</span><h1>{title}</h1><p>{copy}</p></header>;
}
function Metric({ value, label }: { value: string; label: string }) {
  return <div className="hk-metric"><strong>{value}</strong><span>{label}</span></div>;
}
function Check({ text }: { text: string }) {
  return <label className="hk-check"><input type="checkbox" defaultChecked /><span>{text}</span></label>;
}

/** CSS concept hockey card — circular photo well, rink stripe, maple accent. */
function HockeyCard({ name, number, position, goalie = false }: { name: string; number: string; position: string; goalie?: boolean }) {
  const stats = goalie ? HOCKEY.goalieStats : HOCKEY.skaterStats;
  return <div className="hk-card" aria-label={`${name} concept hockey card`}>
    <span className="hk-card-border" />
    <span className="hk-card-team">MAPLE RIDGE U11</span>
    <span className="hk-card-leaf" aria-hidden="true">🍁</span>
    <div className="hk-card-photo" aria-hidden="true">{number}</div>
    <div className="hk-card-name">{name}</div>
    <div className="hk-card-detail">#{number} · {position.toUpperCase()}</div>
    <div className="hk-card-stats">{stats.map((s) => <span key={s}>{s}</span>)}</div>
  </div>;
}

function Gallery({ highlightNew = false }: { highlightNew?: boolean }) {
  const done = ROSTER.filter((r) => r.done);
  return <div className="hk-gallery-wrap"><div className="hk-gallery" role="list" aria-label="Cards the team has already made">
    {highlightNew && <div role="listitem" className="hk-gallery-item yours"><HockeyCard name="Ava S." number="5" position="Defence" /><span className="hk-gallery-tag">Yours ✓</span></div>}
    {done.map((r) => <div key={r.id} role="listitem" className="hk-gallery-item"><HockeyCard name={r.name} number={r.number} position={r.position} goalie={r.position === 'Goalie'} /><span className="hk-gallery-name">{r.name}</span></div>)}
    <div role="listitem" className="hk-gallery-item"><div className="hk-ghost"><span aria-hidden="true">＋</span><b>This could be yours</b></div></div>
  </div><p className="hk-gallery-count">{done.length + (highlightNew ? 1 : 0)} cards made so far · scroll to see the team</p></div>;
}

function PriceLadder({ done, onLearnMore }: { done: number; onLearnMore?: () => void }) {
  const price = done >= HOCKEY.squadTarget ? HOCKEY.tiers.squad : done >= 2 ? HOCKEY.tiers.multi : HOCKEY.tiers.single;
  const toSquad = Math.max(0, HOCKEY.squadTarget - done);
  return <div>
    <div className="hk-grid"><Metric value={`${done} of ${HOCKEY.squadTarget}`} label="cards completed" /><Metric value={`${price} CAD`} label="current team price" /></div>
    <progress className="hk-progress" value={Math.min(done, HOCKEY.squadTarget)} max={HOCKEY.squadTarget} aria-label={`${done} of ${HOCKEY.squadTarget} cards completed`} />
    <p className="hk-help">{toSquad > 0 ? `${toSquad} more completed card${toSquad === 1 ? '' : 's'} unlock ${HOCKEY.tiers.squad} for the whole team — nobody pays until the invitation closes, so everyone gets the final price.` : `Team price locked: ${HOCKEY.tiers.squad} per card for everyone.`}</p>
    {onLearnMore && <button type="button" className="hk-learnmore" onClick={onLearnMore}>How team pricing works →</button>}
  </div>;
}

export default function HockeyCanadaPreview() {
  const [state, setState] = useState<PreviewState>(() => {
    if (typeof window !== 'undefined') {
      const wanted = new URLSearchParams(window.location.search).get('state');
      if (wanted && states.some(([id]) => id === wanted)) return wanted as PreviewState;
    }
    return 'create';
  });
  const [linkCopied, setLinkCopied] = useState(false);
  const [justFinished, setJustFinished] = useState(false);
  const [justPaid, setJustPaid] = useState(false);
  const index = states.findIndex(([id]) => id === state);
  const go = (o: number) => setState(states[(index + o + states.length) % states.length][0]);
  const doneCount = ROSTER.filter((r) => r.done).length + (justFinished ? 1 : 0);

  const screen = useMemo(() => {
    switch (state) {
      case 'create': return <>
        <Hero eyebrow="Organiser setup" title="Create a Team Invite" copy="One team link for the group chat. Each family makes their player's card in under a minute. Nobody pays until the team price is confirmed." />
        <div className="hk-two"><label className="hk-field">Team<input defaultValue="Maple Ridge Thunder U11" /></label><label className="hk-field">Division<input defaultValue="U11 A" /></label></div>
        <div className="hk-two"><label className="hk-field">Organiser<input defaultValue="Coach Tremblay" /></label><label className="hk-field">Invitation deadline<input defaultValue={deadline} /></label></div>
        <label className="hk-field">Estimated roster size<input defaultValue="17" inputMode="numeric" /></label>
        <Check text="I am an adult authorised to create and share this Team Invite." />
        <button className="hk-primary" onClick={() => setState('board')}>Create Team Invite <span>→</span></button>
        <p className="hk-help">Your invite page opens immediately, ready to share. Emblem&rsquo;s safety review runs in the background — sharing pauses only if something needs a second look.</p>
      </>;
      case 'board': return <>
        <Hero eyebrow="Maple Ridge Thunder · U11 A" title="The team&rsquo;s cards are coming together" copy="Nobody pays until the invitation closes — every card made brings the price down for the whole team." />
        <Gallery highlightNew={justFinished} />
        <PriceLadder done={doneCount} onLearnMore={() => setState('pricing')} />
        <div className="hk-grid"><Metric value={deadline} label="invitation closes" /><Metric value={`~${shipDate}`} label="estimated delivery to the rink" /></div>
        <p className="hk-help">Preview only — no payment will be taken.</p>
        <button className="hk-primary" onClick={() => setState('photo')}>Make yours now too <span>→</span></button>
        <div className="hk-actions"><button className="hk-secondary" onClick={() => setLinkCopied(true)}>{linkCopied ? 'Link copied ✓' : 'Copy team link'}</button><button className="hk-secondary" onClick={() => setState('share')}>Share to group chat</button></div>
        <p className="hk-help">Anyone with this link lands right here — the more families see the board, the faster the price drops.</p>
      </>;
      case 'pricing': return <>
        <Hero eyebrow="How team pricing works" title="More cards, lower price — for everyone" copy="One price per card in Canadian dollars, decided by how many the team completes before the invitation closes." />
        <div className="hk-tiertable" role="table" aria-label="Price tiers">
          <div role="row" className="hk-tier"><b>1 card</b><span>Single</span><strong>{HOCKEY.tiers.single}</strong></div>
          <div role="row" className="hk-tier active"><b>2–11 cards</b><span>Multi</span><strong>{HOCKEY.tiers.multi}</strong></div>
          <div role="row" className="hk-tier"><b>12+ cards</b><span>Team — unlocks a free coach card</span><strong>{HOCKEY.tiers.squad}</strong></div>
        </div>
        <p className="hk-help">The final tier is set by completed cards at close. Because payment happens after close, early families always pay the same as everyone else — being first never costs more. Prices in CAD; taxes calculated at checkout by province.</p>
        <div className="hk-trust"><b>Want to bring Emblem to more teams?</b><span>Organisers who run a successful Team Invite can join our affiliate programme — earn a commission for every team you bring. <a className="hk-mailto" href="mailto:hello@emblem.cards?subject=Emblem%20Canada%20affiliate%20programme">Email us to find out more</a>.</span></div>
        <button className="hk-secondary" onClick={() => setState('board')}>Back to the team</button>
      </>;
      case 'photo': return <>
        <Hero eyebrow="Step 1 of 2" title="Drop their hockey photo" copy="One clear photo of your player — game action or team photo day both work. We handle the cutout, the card design and the print." />
        <button className="hk-photodrop" type="button" onClick={() => setState('save')}><span aria-hidden="true">📷</span><b>Tap to add a photo</b><small>or drag one here · Synthetic preview — no photo is uploaded</small></button>
        <div className="hk-actions"><HockeyCard name="Your Player" number="00" position="Centre" /><div style={{ display: 'grid', gap: 6, alignContent: 'center', fontSize: 13, color: '#44597a' }}><div>Maple Ridge Thunder U11 · team template</div><div>Name, number and position added at save</div><div>Design matches the team&rsquo;s cards</div></div></div>
        <button className="hk-primary" onClick={() => setState('save')}>Looks good <span>→</span></button>
      </>;
      case 'save': return <>
        <Hero eyebrow="Step 2 of 2" title="Save the card" copy="Their name, number and position, an email so you can come back, and four quick confirmations. That&rsquo;s everything." />
        <div className="hk-two"><label className="hk-field">Player&rsquo;s first name<input defaultValue="Ava S." /></label><label className="hk-field">Jersey number<input defaultValue="5" inputMode="numeric" /></label></div>
        <label className="hk-field">Position<input defaultValue="Defence" /></label>
        <label className="hk-field">Email address<input defaultValue="jordan.chen@example.test" type="email" /></label>
        <Check text="I am the child&rsquo;s parent/guardian or have permission to submit their details." />
        <Check text="I have permission to use this photograph on the printed card." />
        <Check text="I understand the cards will be delivered together to Coach Tremblay at the rink." />
        <Check text="I understand I am not paying today. I&rsquo;ll get one payment request in CAD at the final team price after the invitation closes." />
        <button className="hk-primary" onClick={() => { setJustFinished(true); setState('done'); }}>Save my player&rsquo;s card <span>→</span></button>
      </>;
      case 'done': return <>
        <div className="hk-success">✓</div>
        <Hero eyebrow="Card completed" title="Ava&rsquo;s card is on the board" copy={`Nothing to pay today. ${Math.max(0, HOCKEY.squadTarget - doneCount)} more cards and the whole team drops to ${HOCKEY.tiers.squad} — including yours.`} />
        <Gallery highlightNew />
        <PriceLadder done={doneCount} />
        <div className="hk-actions"><button className="hk-primary" onClick={() => setState('share')}>Nudge the team group chat</button><button className="hk-secondary" onClick={() => setState('board')}>Back to the team</button></div>
      </>;
      case 'share': return <>
        <Hero eyebrow="Group chat preview" title="Ready to share" copy="No contacts or group membership are sent to Emblem." />
        <div className="hk-phone"><div className="hk-phone-top">Thunder U11 Families <span>•••</span></div><div className="hk-message"><b>Coach Tremblay</b><p>Maple Ridge Thunder U11 has opened an Emblem Team Invite. Make your player&rsquo;s hockey card by {deadline} — takes a minute, nobody pays until the team price is confirmed. 9 cards done already!</p><div className="hk-share-card"><span className="leaf" aria-hidden="true">🍁</span><span><b>Join Thunder U11</b> — 3 more cards unlock {HOCKEY.tiers.squad} · one delivery to the rink</span></div></div></div>
        <button className="hk-secondary" onClick={() => setState('board')}>Preview a family opening the link →</button>
      </>;
      case 'closed': return <>
        <Hero eyebrow="Invitation closed" title="New card starts are closed" copy="Families who began before the deadline may finish during the 24-hour grace period. Then the team price is confirmed and payment requests go out." />
        <span className="hk-pill">Team price confirms after grace</span>
        <PriceLadder done={doneCount} />
        <button className="hk-secondary" onClick={() => setState('pay-email')}>Preview the payment request →</button>
      </>;
      case 'pay-email': return <>
        <Hero eyebrow="After close" title="One payment request" copy="When the invitation closes, every family with a completed card receives one email at the final confirmed team price — in Canadian dollars." />
        <div className="hk-phone"><div className="hk-phone-top">Emblem <span>to jordan.chen@example.test</span></div><div className="hk-message"><b>Team price confirmed: {HOCKEY.tiers.squad} CAD per card</b><p>Maple Ridge Thunder U11 finished with 12 completed cards, so everyone pays the team price. Pay for Ava&rsquo;s card by {payBy} using your team link. Cards go to print once the team&rsquo;s payments are in.</p><div className="hk-share-card"><span className="leaf" aria-hidden="true">🍁</span><span><b>Pay for Ava&rsquo;s card — {HOCKEY.tiers.squad}</b> · opens your team board</span></div></div></div>
        <button className="hk-secondary" onClick={() => setState('pay-board')}>Open the board in payment mode →</button>
      </>;
      case 'pay-board': return <>
        <Hero eyebrow="Maple Ridge Thunder · U11 A" title={`Team price locked: ${HOCKEY.tiers.squad}`} copy={`Every completed card pays the same. Unpaid cards are not printed — pay by ${payBy}.`} />
        <div className="hk-grid"><Metric value={`${HOCKEY.tiers.squad} CAD`} label="confirmed price per card" /><Metric value={justPaid ? '8 of 12' : '7 of 12'} label="cards paid" /></div>
        <div style={{ display: 'grid', gap: 6 }}>{ROSTER.filter((r) => r.done || r.id === 'h10').map((r, i) => { const mine = r.id === 'h10'; const paid = i < 7 || (mine && justPaid); return <div key={r.id} className={`hk-payrow${paid ? ' done' : ''}`}><span className="check">{paid ? '✓' : ''}</span><span className="name">{r.name}</span><span className="num">#{r.number}</span>{mine && !paid ? <button type="button" className="hk-paybtn" onClick={() => { setJustPaid(true); setState('pay-done'); }}>Pay {HOCKEY.tiers.squad}</button> : <span className="status">{paid ? 'Paid' : 'Awaiting payment'}</span>}</div>; })}</div>
        <p className="hk-help">Same rails as the UK product: fixed price-tier variants through the existing cart permalink + HMAC-verified paid webhook. Currency and tax localisation are the Canadian additions.</p>
      </>;
      case 'pay-done': return <>
        <div className="hk-success">✓</div>
        <Hero eyebrow="Payment confirmed" title="Ava&rsquo;s card is paid and going to print" copy="That&rsquo;s everything. Cards print once the team&rsquo;s payments are in, then arrive together in one package for Coach Tremblay to hand out at the rink." />
        <div className="hk-grid"><Metric value={`${HOCKEY.tiers.squad} CAD`} label="paid — team price" /><Metric value={`~${shipDate}`} label="estimated delivery" /></div>
        <button className="hk-primary" onClick={() => setState('pay-board')}>Back to the team board</button>
      </>;
    }
  }, [state, linkCopied, justFinished, justPaid, doneCount]);

  return <main className="hk-preview"><div className="hk-shell">
    <div className="hk-preview-bar"><b>Synthetic product preview</b><span>· Emblem Canada Hockey concept · No database · No payments · No real child data</span></div>
    <aside className="hk-reviewer-nav" aria-label="Reviewer navigation"><strong>Reviewer navigation — synthetic preview only</strong><div><button onClick={() => go(-1)} aria-label="Previous state">←</button><select value={state} onChange={(e) => setState(e.target.value as PreviewState)} aria-label="Choose preview state">{states.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select><button onClick={() => go(1)} aria-label="Next state">→</button></div></aside>
    <div className="hk-surface">
      <header className="hk-brand"><div className="hk-brand-lockup"><span className="leaf" aria-hidden="true">🍁</span><span>EMBLEM <small>CANADA</small></span></div><small>Hockey · Hockey sur glace</small></header>
      <section className="hk-screen" aria-label={states[index][1]}>{screen}</section>
      <footer className="hk-footer"><span>© Emblem Canada</span><span>Privacy · Confidentialité</span><span>Safety</span><span>Support</span></footer>
    </div>
  </div></main>;
}
