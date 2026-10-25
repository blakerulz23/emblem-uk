import AnalyticsChoice from '@/components/marketing/AnalyticsChoice';
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
        Last updated 25 October 2026
      </p>

      <p style={{ ...BODY, marginTop: 20 }}>
        Emblem (&ldquo;we&rdquo;, &ldquo;us&rdquo;) operates emblem.cards, including the Player OS,
        Coach OS and Squad Invite features described below. This policy explains what we collect
        across the whole product — not just the shop — and what we do with it.
        Emblem is a trading name of LAUDA CARTOONS STUDIO LTD, a company registered in England and Wales
        (company number 16063577), registered office 344 Oldham Road, Ashton-under-Lyne, OL7 9PS.
        Contact: hello@emblem.cards.
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
          card design. Background removal is optional and runs on your own device, in your
          browser: the photo is not sent to us or to any AI service for it, and you can always
          continue with the original photo instead. Nothing is uploaded to us while you build.
          When you send your card, the photo you chose (with its background removed, if you
          chose that) is uploaded to our private storage, together with the print-ready card
          file made from it, so we can check and produce your card. The unedited original stays
          on your device and is not sent.
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

      <h3 style={SUBSECTION_TITLE}>Saved on your device while you build</h3>
      <p style={BODY}>
        So you don&rsquo;t lose your work, the card builder saves your card&rsquo;s details
        (player name, number, position, design choices and the contact details you typed) and
        the images you added (the photo, its original if you removed the background, and any
        badge) in your browser&rsquo;s own storage on this device. None of this is sent to us
        until you send your card. It is deleted automatically after 3 days, once your card has been sent, or
        straight away if you choose &ldquo;Discard&rdquo; (tap the Emblem logo in the builder).
        We never save adult permission or consent answers this way — those are asked again.
      </p>
      <p style={{ ...BODY, marginTop: 10 }}>
        <strong style={{ color: 'var(--ink)' }}>Shared or public devices:</strong> anyone who
        uses the same browser on the same device within those 3 days could reopen the builder
        and see the saved card, including the child&rsquo;s photo. On a shared, family or public
        device, tick &ldquo;Don&rsquo;t save on this device&rdquo; on the photo step: nothing is saved
        while it&rsquo;s ticked, and anything already saved by the builder on that device is deleted
        straight away. You can also choose &ldquo;Discard&rdquo; when you finish, or use a private
        browsing window.
        If sending was interrupted, the builder keeps your card and checks with us whether the
        order already reached us before letting you send it again, so the builder never sends the same order twice.
      </p>

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

      <h3 style={SUBSECTION_TITLE}>Creator partners and partner codes</h3>
      <p style={BODY}>
        Adults who apply to our partner programme give us their name, email, main social platform,
        a link to their profile and a short note about their audience. We use these only to review
        the application and, if approved, to run the partnership: their code, commission and
        payments (bank details are requested by email when a payment is due and are not stored on
        our site). This is necessary to take steps towards, and perform, our agreement with them.
      </p>
      <p style={{ ...BODY, marginTop: 10 }}>
        If you use a partner&rsquo;s code at checkout, we record which code was used on your order so
        the partner can be paid. The partner sees only the date and amount of the order, never your
        name, contact details, or anything about your child.
      </p>
      <p style={{ ...BODY, marginTop: 10 }}>
        <strong style={{ color: 'var(--ink)' }}>How long we keep partner information:</strong>{' '}
        Applications that do not lead to an approved partnership are deleted when no longer needed,
        and normally within 12 months of submission. We retain active partner information while
        needed to administer the partnership. Commission, payout and associated accounting records
        are retained for six years from the end of the financial year they relate to, or longer where
        legally required. Other partner information is deleted or anonymised when no longer needed.
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

      <h2 id="analytics" style={SECTION_TITLE}>Website analytics</h2>
      <p style={BODY}>
        We use Vercel Web Analytics to count how people use our public pages and the card builder,
        so we can see which pages help families and where the builder needs improving. It sets no
        cookies and stores nothing on your device. The results we see are totals only (for example,
        how many visits a page had and how many people reached each builder step); we can&rsquo;t
        see who you are and we don&rsquo;t use it to profile anyone or make decisions about you.
      </p>
      <p style={{ ...BODY, marginTop: 10 }}>
        <strong style={{ color: 'var(--ink)' }}>What is collected:</strong> the page address with
        any personal parts removed (only campaign tags such as <code>utm_source</code> are kept),
        the referring site, broad device, browser and country information, and a small number of
        builder events: a builder step being reached, a card being started or completed, and
        checkout being opened. These events carry only fixed labels, such as the step name, the
        type of order and a broad traffic source (search, social, direct or other). Vercel uses
        your IP address and browser details briefly to count unique visits for the day; it
        doesn&rsquo;t store them in your browser or link them with anything else.
      </p>
      <p style={{ ...BODY, marginTop: 10 }}>
        <strong style={{ color: 'var(--ink)' }}>What is never sent:</strong> children&rsquo;s or
        guardians&rsquo; names, photos, email addresses or phone numbers, anything typed into a
        form, card contents, verification codes, payment details, order or invitation references,
        and private links. No analytics runs on the Player OS, card or player pages, staff pages,
        approval links, or any Squad Invite page other than the public start page. Payments are
        counted from our own order records, never from analytics.
      </p>
      <p style={{ ...BODY, marginTop: 10 }}>
        Vercel provides this service under its Data Processing Addendum and privacy notice,
        which also set out how data is protected when it is handled outside the UK. We use the
        results only to understand, in aggregate, how the site is used and to improve it, which
        is our legitimate interest. You can object at any time, free of charge, below; we also
        treat a Global Privacy Control signal from your browser as an objection. Your choice is
        remembered on this device only and changes nothing else on the site.
      </p>
      <div style={{ ...BODY, marginTop: 12 }}>
        <AnalyticsChoice />
      </div>

      <h2 style={SECTION_TITLE}>Who we share data with</h2>
      <ul style={{ ...BODY, paddingLeft: 20, display: 'grid', gap: 8 }}>
        <li><strong style={{ color: 'var(--ink)' }}>Shopify</strong> — processes orders, payment and shipping details under their own privacy policy.</li>
        <li><strong style={{ color: 'var(--ink)' }}>Supabase</strong> — hosts our database and handles sign-in (including one-time email codes).</li>
        <li><strong style={{ color: 'var(--ink)' }}>Amazon Web Services (S3)</strong> — stores photos and print files privately; access is signed and time-limited.</li>
        <li><strong style={{ color: 'var(--ink)' }}>Vercel</strong> — hosts the website and app, and provides our cookieless website analytics (see &ldquo;Website analytics&rdquo; above).</li>
        <li><strong style={{ color: 'var(--ink)' }}>Google (Gemini)</strong> — not used for photos in the current card builder, where background removal runs on your device. Earlier versions of the builder sent a photo to Gemini when AI background removal was chosen for that upload; a non-AI option was always available.</li>
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
