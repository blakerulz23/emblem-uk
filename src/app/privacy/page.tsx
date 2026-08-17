const SECTION_TITLE = {
  fontFamily: 'var(--font-sora), system-ui',
  fontWeight: 700,
  fontSize: 20,
  letterSpacing: '-0.01em',
  color: 'var(--ink)',
  marginTop: 36,
  marginBottom: 10,
};

const SUBSECTION_TITLE = {
  fontFamily: 'var(--font-sora), system-ui',
  fontWeight: 700,
  fontSize: 16,
  color: 'var(--ink)',
  marginTop: 22,
  marginBottom: 8,
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

export default function PrivacyPage() {
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
        Privacy Policy
      </span>

      <h1
        className="mt-6"
        style={{
          fontFamily: 'var(--font-sora), system-ui', fontWeight: 800,
          fontSize: 'clamp(32px, 5vw, 44px)', lineHeight: 1.08, letterSpacing: '-0.02em',
          color: 'var(--ink)', margin: '24px 0 0',
        }}
      >
        Privacy Policy
      </h1>
      <p style={{ ...BODY, marginTop: 8, fontSize: 13.5, color: 'var(--ink-faint)' }}>
        Last updated [DATE]
      </p>

      <p style={{ ...BODY, marginTop: 20 }}>
        Emblem (&ldquo;we&rdquo;, &ldquo;us&rdquo;) operates emblem.cards, including the Player OS,
        Coach OS and Squad Invite features described below. This policy explains what we collect
        across the whole product — not just the shop — and what we do with it. Emblem is currently
        operated as a trading name; formal company registration details will be added here once
        finalised.
      </p>

      <div style={SUMMARY_BOX}>
        <strong>In short, for families:</strong> a card belongs to one child. Whoever claims it
        controls it — usually a parent or guardian — and decides what, if anything, is ever made
        public. Nothing is public by default. Coaches only see what you connect them to. We don&rsquo;t
        sell data or use it for advertising. A child&rsquo;s exact date of birth, height, and any
        coach assessment are never shown publicly, ever. You can ask us to delete a child&rsquo;s
        data at any time — see &ldquo;Your rights&rdquo; below.
      </div>

      <h2 style={SECTION_TITLE}>What we collect</h2>

      <h3 style={SUBSECTION_TITLE}>To build and produce a card</h3>
      <ul style={{ ...BODY, paddingLeft: 20, display: 'grid', gap: 8 }}>
        <li>
          <strong style={{ color: 'var(--ink)' }}>Photos you upload</strong> — used to build the
          card design and, where AI-styled processing is used, sent to a third-party AI image
          service to generate that styling. A non-AI option is available for this.
        </li>
        <li>
          <strong style={{ color: 'var(--ink)' }}>Player details</strong> — first name, surname
          initial, position, squad number, team/club, and (where a coach adds it) exact date of
          birth, height, preferred foot and similar sporting details.
        </li>
        <li>
          <strong style={{ color: 'var(--ink)' }}>Order and shipping information</strong> —
          purchaser name, email and delivery address, handled by Shopify, our checkout provider.
        </li>
        <li>
          <strong style={{ color: 'var(--ink)' }}>Generated print files</strong> — rendered from
          your design and stored privately on Amazon S3 solely to produce and ship the order.
        </li>
      </ul>

      <h3 style={SUBSECTION_TITLE}>Once a card is claimed — Player OS</h3>
      <p style={BODY}>
        Tapping or claiming a card creates a private profile (&ldquo;Player OS&rdquo;) for that
        child, visible only to the guardian(s) who claimed it and any coach the guardian
        specifically connects. It can include:
      </p>
      <ul style={{ ...BODY, paddingLeft: 20, display: 'grid', gap: 8 }}>
        <li>moments, photos and videos a guardian or connected coach adds;</li>
        <li>coach assessments, recognised strengths and season focus areas;</li>
        <li>goals set by the guardian or a connected coach;</li>
        <li>the guardian and coach accounts linked to that child, and their relationship to them.</li>
      </ul>
      <p style={{ ...BODY, marginTop: 10 }}>
        None of this is visible to anyone outside that circle unless a guardian explicitly makes a
        specific moment public (see &ldquo;Public profiles&rdquo; below) — and even then, exact
        date of birth, height, coach assessments, goals and season focus are never included in
        what&rsquo;s shown publicly, under any setting.
      </p>

      <h3 style={SUBSECTION_TITLE}>Coach and organiser accounts</h3>
      <p style={BODY}>
        Coaches and Squad Invite organisers sign in with their own email (verified with a one-time
        code). We do not verify employment, DBS status, safeguarding clearance, or that someone
        claiming to be a child&rsquo;s parent actually is — see &ldquo;A note on identity
        verification&rdquo; below for what we do check.
      </p>

      <h3 style={SUBSECTION_TITLE}>Squad Invite</h3>
      <p style={BODY}>
        Squad Invite lets a team organiser (coach or club representative) request one shared link
        that each parent uses independently to build their own child&rsquo;s card. The organiser
        never sees child names, photos or a roster — only their own request details (team name,
        estimated squad size, delivery contact) and, once parents start joining, a running count
        and each joined child&rsquo;s first name and surname initial only, so the organiser can
        confirm the names actually belong to their own team. Each parent&rsquo;s photo, full name
        and any other detail stays private to that parent and to Emblem staff reviewing the
        request.
      </p>

      <h2 style={SECTION_TITLE}>A note on identity verification</h2>
      <p style={BODY}>
        Signing in with an email and one-time code proves control of that email address — it does
        not prove you are a child&rsquo;s parent or legal guardian, that you are an authorised
        coach, or that a club representative genuinely represents that club. We ask everyone to
        confirm their authority as part of using the product, and for Squad Invite, the team
        organiser can see enough (first name and surname initial only) to notice if a name doesn&rsquo;t
        belong to their real squad and flag it to us. We are continuing to build stronger
        verification; if you believe someone has claimed a child without proper authority, contact
        us immediately (see &ldquo;Contact&rdquo; below) and we will investigate and can freeze the
        record in question.
      </p>

      <h2 style={SECTION_TITLE}>Public profiles</h2>
      <p style={BODY}>
        A player&rsquo;s profile is private by default. A guardian can choose to make specific,
        individual moments public, and can choose whether the player has any public page at all.
        Even when enabled, a public profile only ever shows an allow-listed set of fields chosen to
        exclude anything sensitive — never exact date of birth, age, height, preferred foot,
        ambitions, assessments, goals, season focus, guardian identity, or the claim token itself.
        A guardian can disable public sharing at any time, which takes the page down immediately.
      </p>
      <p style={{ ...BODY, marginTop: 10 }}>
        We do not currently apply search-engine no-index protection to every public profile page —
        we are working on this. Until it is in place, treat a public profile as potentially
        discoverable by search engines and plan accordingly (for example, delaying enabling it, or
        keeping it off entirely).
      </p>

      <h2 style={SECTION_TITLE}>The physical NFC card</h2>
      <p style={BODY}>
        NFC-enabled products contain a passive chip carrying a web link with a unique claim code.
        Tapping it opens that link; the chip itself stores no personal data and transmits nothing
        on its own. If a card is lost or stolen before being claimed, contact us and we will not
        activate it under that reference. If a card is lost or stolen after being claimed, contact
        us immediately — today we can disable or rotate its public profile, and a fuller
        card-level revocation process is actively being built. Until then, anyone who taps a lost
        claimed card cannot see the private Player OS (that requires the guardian&rsquo;s own
        sign-in) but could reach a public profile if one was enabled for that child.
      </p>

      <h2 style={SECTION_TITLE}>Who we share data with</h2>
      <ul style={{ ...BODY, paddingLeft: 20, display: 'grid', gap: 8 }}>
        <li><strong style={{ color: 'var(--ink)' }}>Shopify</strong> — processes orders, payment and shipping details under their own privacy policy.</li>
        <li><strong style={{ color: 'var(--ink)' }}>Supabase</strong> — hosts our database and handles sign-in (including one-time email codes).</li>
        <li><strong style={{ color: 'var(--ink)' }}>Amazon Web Services (S3)</strong> — stores photos and print files privately; access is signed and time-limited.</li>
        <li><strong style={{ color: 'var(--ink)' }}>Vercel</strong> — hosts the website and app.</li>
        <li><strong style={{ color: 'var(--ink)' }}>Google (Gemini)</strong> — processes a photo only when AI-styled background removal or styling is used for that specific upload; a non-AI option is always available.</li>
        <li><strong style={{ color: 'var(--ink)' }}>Resend</strong> — sends transactional email (sign-in codes, order and account notifications) on our behalf.</li>
      </ul>
      <p style={{ ...BODY, marginTop: 14 }}>
        We do not sell data, and we do not share it with anyone for marketing purposes. Some of
        these suppliers may process data outside the UK; we are reviewing each supplier&rsquo;s
        terms and will update this section with specifics.
      </p>

      <h2 style={SECTION_TITLE}>How long we keep it</h2>
      <p style={BODY}>
        Retention periods below are our current proposal and are still under review — treat them as
        indicative, not final:
      </p>
      <ul style={{ ...BODY, paddingLeft: 20, display: 'grid', gap: 8 }}>
        <li>Print files and production photos: fulfilment plus a short dispute window (proposed 30–90 days), unless kept as part of an active Player OS profile.</li>
        <li>An active player profile and its moments: for as long as the profile is active, reviewed periodically.</li>
        <li>Sign-in and claim-attempt security logs: a short window (proposed 30–90 days).</li>
        <li>Order and payment records: retained by Shopify as required by law (e.g. tax records).</li>
      </ul>
      <p style={{ ...BODY, marginTop: 10 }}>
        You can ask us to delete a player&rsquo;s profile, a specific moment or photo, or a whole
        guardian account at any time — see &ldquo;Your rights&rdquo; below.
      </p>

      <h2 style={SECTION_TITLE}>Your rights (UK GDPR)</h2>
      <p style={BODY}>
        If you&rsquo;re in the UK or EU, you have the right to access, correct, or request deletion
        of personal data, and to object to how we process it. Many of these you can do yourself:
        guardians can remove a photo, unpublish a moment, disable public sharing, remove a coach
        connection, or request full deletion of a child&rsquo;s profile from within Player OS.
        For anything else, or if you&rsquo;re a child old enough to make your own request, contact
        us at{' '}
        <a href="mailto:hello@emblem.cards" style={{ color: 'var(--accent)' }}>hello@emblem.cards</a>.
      </p>

      <h2 style={SECTION_TITLE}>Children using this service</h2>
      <p style={BODY}>
        Emblem is designed around football-playing children, but accounts, sign-in and uploads are
        performed by adults (guardians, coaches, organisers) on a child&rsquo;s behalf. We do not
        knowingly collect account sign-in information directly from a child. If a child themselves
        contacts us with a question or request about their own data, we will respond directly and
        will not require a guardian to be involved to hear that request, though we may need to
        verify it before acting on it.
      </p>

      <h2 style={SECTION_TITLE}>Security</h2>
      <p style={BODY}>
        Player and guardian data is protected by row-level access controls in our database, private
        (never public-by-default) file storage with time-limited signed links, and staff access
        that is separately authorised and logged. No method of transmission or storage is
        completely secure; we cannot guarantee absolute security, but we work to protect your data
        using industry-standard practices and are continuing to invest in this as the product
        grows.
      </p>

      <h2 style={SECTION_TITLE}>Changes to this policy</h2>
      <p style={BODY}>
        We may update this policy as the product changes. Material changes affecting children&rsquo;s
        data will be reviewed before publishing, and we&rsquo;ll update the date at the top of this
        page.
      </p>

      <h2 style={SECTION_TITLE}>Contact</h2>
      <p style={BODY}>
        Questions, concerns, or a request about a child&rsquo;s data:{' '}
        <a href="mailto:hello@emblem.cards" style={{ color: 'var(--accent)' }}>hello@emblem.cards</a>
      </p>
    </div>
  );
}
