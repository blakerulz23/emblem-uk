import Link from 'next/link';

// Same local style-token pattern as src/app/privacy/page.tsx and
// src/app/terms/page.tsx — this codebase keeps each legal/trust page's
// styling self-contained rather than sharing a style module between them.

const SECTION_TITLE = {
  fontFamily: 'var(--font-sora), system-ui',
  fontWeight: 700,
  fontSize: 20,
  letterSpacing: '-0.01em',
  color: 'var(--ink)',
  marginTop: 36,
  marginBottom: 10,
};

const BODY = {
  fontFamily: 'var(--font-manrope), system-ui',
  fontSize: 15.5,
  lineHeight: 1.7,
  color: 'var(--ink-soft)',
};

const SUMMARY_BOX = {
  fontFamily: 'var(--font-manrope), system-ui',
  fontSize: 15,
  lineHeight: 1.7,
  color: 'var(--ink)',
  background: 'var(--accent-tint)',
  border: '1px solid var(--accent)',
  borderRadius: 16,
  padding: '18px 20px',
  marginTop: 20,
};

export default function TrustAndSafeguardingPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
      <span
        style={{
          fontFamily: 'var(--font-jbmono), monospace',
          fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase',
          color: 'var(--accent)', background: 'var(--accent-tint)',
          padding: '6px 12px', borderRadius: 999, display: 'inline-block',
        }}
      >
        Trust &amp; Safeguarding
      </span>

      <h1
        className="mt-6"
        style={{
          fontFamily: 'var(--font-sora), system-ui', fontWeight: 800,
          fontSize: 'clamp(32px, 5vw, 44px)', lineHeight: 1.08, letterSpacing: '-0.02em',
          color: 'var(--ink)', margin: '24px 0 0',
        }}
      >
        Built around young players&rsquo; privacy
      </h1>
      <p style={{ ...BODY, marginTop: 8, fontSize: 13.5, color: 'var(--ink-faint)' }}>
        Last updated [DATE]
      </p>

      <p style={{ ...BODY, marginTop: 20 }}>
        Emblem cards belong to children, so we&rsquo;ve tried to design the product around that fact
        rather than bolt privacy on afterwards. This page explains, in plain language, what that
        means in practice. It doesn&rsquo;t replace our full{' '}
        <Link href="/privacy" style={{ color: 'var(--accent)' }}>Privacy Policy</Link>, which remains
        the legally binding document — this page is the friendlier, parent-facing summary of it.
      </p>

      <div style={SUMMARY_BOX}>
        <strong>In short:</strong> a card belongs to one child. A parent or guardian claims it and
        controls what, if anything, is ever made public. Nothing is public by default. Coaches only
        see what a guardian connects them to, and coach-submitted content is reviewed before it
        appears as &ldquo;verified&rdquo; on a profile. We don&rsquo;t sell data or use it for
        advertising, and a guardian can request access, correction or deletion of their child&rsquo;s
        data at any time.
      </div>

      <h2 style={SECTION_TITLE}>Privacy by default</h2>
      <p style={BODY}>
        A player&rsquo;s digital profile (&ldquo;Player OS&rdquo;) is private the moment it&rsquo;s
        created, visible only to the guardian who claimed it and any coach that guardian specifically
        connects. There is no public roster, leaderboard or directory of players anywhere on
        Emblem — a profile only becomes visible to anyone else if a guardian actively chooses to
        publish it.
      </p>

      <h2 style={SECTION_TITLE}>Guardian controls</h2>
      <p style={BODY}>
        From inside Player OS, a guardian can, at any time and without contacting us:
      </p>
      <ul style={{ ...BODY, paddingLeft: 20, display: 'grid', gap: 8 }}>
        <li>remove a photo or moment;</li>
        <li>unpublish a public profile, taking it down immediately;</li>
        <li>remove a coach&rsquo;s connection to their child;</li>
        <li>request full deletion of their child&rsquo;s profile.</li>
      </ul>
      <p style={{ ...BODY, marginTop: 10 }}>
        These are guardian-only actions — a coach or Squad Invite organiser never has the ability to
        publish, share or delete a child&rsquo;s profile on a guardian&rsquo;s behalf.
      </p>

      <h2 style={SECTION_TITLE}>Coach contributions and verification</h2>
      <p style={BODY}>
        Coaches can add moments, recognitions and season notes to a player they&rsquo;re connected to,
        but nothing a coach submits appears as a &ldquo;verified&rdquo; achievement until reviewed —
        this is a content-review step, distinct from vetting the coach as a person. To be precise
        about what &ldquo;verified&rdquo; does and doesn&rsquo;t mean here: signing in as a coach
        proves control of an email address, not employment, DBS status or club authority. We ask
        every coach and organiser to confirm their own authority as part of using the product, and
        we are continuing to invest in stronger verification over time. If you believe someone has
        connected to a child without proper authority, contact us immediately (see &ldquo;How to
        report a concern&rdquo; below) and we will investigate.
      </p>

      <h2 style={SECTION_TITLE}>What information is collected, and why</h2>
      <p style={BODY}>We collect only what&rsquo;s needed to build, print and connect a card:</p>
      <ul style={{ ...BODY, paddingLeft: 20, display: 'grid', gap: 8 }}>
        <li><strong style={{ color: 'var(--ink)' }}>Photos</strong> — to design the card itself.</li>
        <li><strong style={{ color: 'var(--ink)' }}>Player details</strong> — first name, surname initial, position, squad number and team, so a card and profile can be built.</li>
        <li><strong style={{ color: 'var(--ink)' }}>Order and delivery details</strong> — handled by Shopify, our checkout provider, to get the physical card to you.</li>
      </ul>
      <p style={{ ...BODY, marginTop: 10 }}>
        We do not collect a child&rsquo;s exact date of birth — a football age group (e.g. U10) is
        all the product needs. Full detail on every field we collect, every supplier involved and
        how long each is kept is in the{' '}
        <Link href="/privacy" style={{ color: 'var(--accent)' }}>Privacy Policy</Link>.
      </p>

      <h2 style={SECTION_TITLE}>Sharing and profile visibility</h2>
      <p style={BODY}>
        A guardian can choose to make a player&rsquo;s profile — or specific moments on it — public.
        Even then, only an allow-listed set of fields is ever shown, deliberately excluding anything
        sensitive: never a child&rsquo;s exact date of birth, age, height, coach assessments, season
        goals, or the identity of their guardian. A guardian can switch public sharing off at any
        time, taking the page down immediately.
      </p>

      <h2 style={SECTION_TITLE}>Lost cards and disabled access</h2>
      <p style={BODY}>
        If a card is lost or stolen, contact us and we can disable that specific card&rsquo;s digital
        connection so tapping it no longer resolves to anything. Finding or tapping a lost physical
        card never grants access to the private Player OS or its management controls — that always
        requires the guardian&rsquo;s own sign-in, regardless of who is holding the card.
      </p>

      <h2 style={SECTION_TITLE}>Access, correction and deletion requests</h2>
      <p style={BODY}>
        Guardians can access, correct or delete most of their child&rsquo;s information directly
        within Player OS. For anything else — including a request from a child old enough to make
        their own — contact us at{' '}
        <a href="mailto:hello@emblem.cards" style={{ color: 'var(--accent)' }}>hello@emblem.cards</a>{' '}
        and we will respond directly.
      </p>

      <h2 style={SECTION_TITLE}>A plain-language Children&rsquo;s DPIA summary</h2>
      <p style={BODY}>
        Before building features that touch children&rsquo;s data, we complete a Children&rsquo;s
        Data Protection Impact Assessment (DPIA) — a documented process of identifying what could go
        wrong for a child using the product, and deciding how to reduce that risk before shipping. A
        DPIA is a risk-assessment exercise, not a certificate: completing one doesn&rsquo;t mean a
        feature is risk-free, and we don&rsquo;t claim Emblem is &ldquo;DPIA certified,&rdquo;
        &ldquo;ICO approved,&rdquo; guaranteed secure, or fully compliant with every applicable law —
        those aren&rsquo;t things a DPIA can certify, and no organisation should claim them from one.
      </p>
      <p style={{ ...BODY, marginTop: 10 }}>
        Our current DPIA has identified open items that still require specialist legal and
        safeguarding review, and we treat those as outstanding rather than resolved. We don&rsquo;t
        publish the full internal assessment, its risk register or our security controls here, since
        detailing exactly what we&rsquo;re still working through isn&rsquo;t itself good security
        practice — but we&rsquo;re glad to discuss our approach with a guardian, club or specialist
        reviewer directly on request.
      </p>

      <h2 style={SECTION_TITLE}>How to report a privacy or safeguarding concern</h2>
      <p style={BODY}>
        If you&rsquo;re worried about how a child&rsquo;s data is being used on Emblem — including a
        coach or organiser you believe shouldn&rsquo;t have access to a child, a public profile
        showing something it shouldn&rsquo;t, or a lost card — contact us at{' '}
        <a href="mailto:hello@emblem.cards" style={{ color: 'var(--accent)' }}>hello@emblem.cards</a>.
        We treat safeguarding-related reports as urgent and will respond as quickly as we can.
      </p>

      <h2 style={SECTION_TITLE}>The full legal detail</h2>
      <p style={BODY}>
        This page is a summary. Our{' '}
        <Link href="/privacy" style={{ color: 'var(--accent)' }}>Privacy Policy</Link> and{' '}
        <Link href="/terms" style={{ color: 'var(--accent)' }}>Terms of Service</Link> are the
        complete, binding documents covering everything above in full detail.
      </p>
    </div>
  );
}
