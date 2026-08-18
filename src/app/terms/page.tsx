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

export default function TermsPage() {
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
        Terms of Service
      </span>

      <h1
        className="mt-6"
        style={{
          fontFamily: 'var(--font-sora), system-ui', fontWeight: 800,
          fontSize: 'clamp(32px, 5vw, 44px)', lineHeight: 1.08, letterSpacing: '-0.02em',
          color: 'var(--ink)', margin: '24px 0 0',
        }}
      >
        Terms of Service
      </h1>
      <p style={{ ...BODY, marginTop: 8, fontSize: 13.5, color: 'var(--ink-faint)' }}>
        Last updated [DATE]
      </p>

      <p style={{ ...BODY, marginTop: 20 }}>
        These terms govern your use of emblem.cards and any order, account, or feature on it —
        including Player OS, Coach OS and Squad Invite — operated by Emblem. Emblem is currently
        operated as a trading name; formal company registration details will be added here once
        finalised.
      </p>

      <h2 style={SECTION_TITLE}>Accounts and who you say you are</h2>
      <p style={BODY}>
        Signing in with an email and one-time code proves you control that email — it does not
        verify your identity, your relationship to a child, your employment, or any safeguarding
        clearance. By claiming a card, connecting as a coach, or organising a Squad Invite, you
        confirm that any declaration you make (parental authority, coaching authorisation, club
        representation) is true. Knowingly making a false declaration is a serious matter and may
        result in the affected record being frozen, removed, or reported, and your access being
        terminated.
      </p>

      <h2 style={SECTION_TITLE}>Guardians and Player OS</h2>
      <p style={BODY}>
        Whoever claims a card is responsible for what they add to that child&rsquo;s profile and
        for who they connect as a coach. You can remove a coach connection, disable public
        sharing, delete a moment or photo, or request full deletion of the profile at any time.
        Content you make public can be viewed, and potentially copied or downloaded, by anyone with
        the link — think carefully before enabling public sharing.
      </p>

      <h2 style={SECTION_TITLE}>Coaches</h2>
      <p style={BODY}>
        Coach access is granted by a guardian (direct connection) or comes from an organiser&rsquo;s
        Squad Invite approval (team-wide access). Using assessment, strength, goal and moment
        features responsibly — accurately, respectfully, and only for coaching purposes — is a
        condition of that access. A guardian or Emblem staff can remove your access at any time.
      </p>

      <h2 style={SECTION_TITLE}>Squad Invite organisers</h2>
      <p style={BODY}>
        By submitting a Squad Invite request, you confirm you are authorised to organise this for
        the named team, and that your delivery recipient has agreed to receive and distribute the
        completed order. Requests are reviewed and approved by Emblem staff before parents can
        join — approval is not guaranteed and may be declined or require changes. During the
        controlled pilot, no payment is collected or requested through Squad Invite.
      </p>

      <h2 style={SECTION_TITLE}>Content standards</h2>
      <p style={BODY}>
        You&rsquo;re responsible for the photos, names, and other content you upload. By submitting
        content, you confirm you own the rights to it or have permission to use it (including
        permission from a parent/guardian if it depicts a child), and that it isn&rsquo;t unlawful,
        offensive, or infringing. We reserve the right to remove content, decline or cancel an
        order, or restrict an account that violates this, including content raised through the
        Squad Invite &ldquo;flag a concern&rdquo; process or any other report to us.
      </p>

      <h2 style={SECTION_TITLE}>Public profiles</h2>
      <p style={BODY}>
        Public profiles are opt-in and guardian-controlled. We choose what a public profile can
        ever show (never exact date of birth, height, assessments, goals or guardian identity), but
        we cannot control what a third party does with content once it&rsquo;s public — including
        copying, downloading, or indexing by a search engine. Disabling public sharing removes the
        page going forward but cannot retroactively remove copies others may already have made.
      </p>

      <h2 style={SECTION_TITLE}>The physical NFC card</h2>
      <p style={BODY}>
        Products described as NFC-enabled include a physical chip carrying a claim link.
        Functionality available via the chip is described at the time of purchase. If a card is
        lost, stolen, or damaged, contact us — see the Privacy Policy for what we can currently do
        about a lost or stolen card, and its limitations.
      </p>

      <h2 style={SECTION_TITLE}>Orders and payment</h2>
      <p style={BODY}>
        Orders placed through the standard builder are processed and paid for through Shopify. By
        placing an order, you agree to Shopify&rsquo;s terms in addition to these. Prices are shown
        in [CURRENCY] and are subject to change without notice; the price at checkout is the price
        charged. Squad Invite does not currently collect payment — see above.
      </p>

      <h2 style={SECTION_TITLE}>Production and shipping</h2>
      <p style={BODY}>
        Orders are produced to order after checkout (or, for Squad Invite, after a parent
        completes their child&rsquo;s card and the organiser&rsquo;s delivery setup is complete).
        Standard production and shipping is 3–5 business days unless otherwise stated. Shipping
        timeframes are estimates, not guarantees, and we&rsquo;re not responsible for courier
        delays once an order has shipped.
      </p>

      <h2 style={SECTION_TITLE}>Returns and reprints</h2>
      <p style={BODY}>
        Because every order is custom-made, we don&rsquo;t offer returns for buyer&rsquo;s remorse.
        If your order arrives damaged, defective, or significantly different from your approved
        design, contact{' '}
        <a href="mailto:hello@emblem.cards" style={{ color: 'var(--accent)' }}>hello@emblem.cards</a>{' '}
        within 14 days of delivery for a free reprint or refund.
      </p>

      <h2 style={SECTION_TITLE}>Account and access removal</h2>
      <p style={BODY}>
        We may suspend or remove access — including a guardian, coach, or organiser account, a
        public profile, or specific content — where we reasonably believe these terms, applicable
        law, or a child&rsquo;s safety is at risk, with or without prior notice depending on the
        severity of the concern.
      </p>

      <h2 style={SECTION_TITLE}>Limitation of liability</h2>
      <p style={BODY}>
        We provide products and features &ldquo;as is.&rdquo; To the maximum extent permitted by
        law, Emblem is not liable for indirect or consequential losses arising from use of this
        site, its products, or its features, including content made public by a guardian&rsquo;s
        own choice.
      </p>

      <h2 style={SECTION_TITLE}>Changes to these terms</h2>
      <p style={BODY}>
        We may update these terms from time to time. Continued use of the site after changes are
        posted means you accept the updated terms.
      </p>

      <h2 style={SECTION_TITLE}>Governing law</h2>
      <p style={BODY}>
        These terms are governed by the laws of England and Wales. [Placeholder — full governing
        law and jurisdiction clause to be finalised with legal review.]
      </p>

      <h2 style={SECTION_TITLE}>Contact</h2>
      <p style={BODY}>
        <a href="mailto:hello@emblem.cards" style={{ color: 'var(--accent)' }}>hello@emblem.cards</a>
      </p>
    </div>
  );
}
