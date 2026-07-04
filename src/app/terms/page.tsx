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
        These terms govern your use of emblem.cards and any order placed through it, operated by
        Emblem. Emblem is currently operated as a trading name; formal company registration
        details will be added here once finalised.
      </p>

      <h2 style={SECTION_TITLE}>Orders and payment</h2>
      <p style={BODY}>
        All orders are processed and paid for through Shopify. By placing an order, you agree to
        Shopify&rsquo;s terms in addition to these. Prices are shown in [CURRENCY] and are
        subject to change without notice; the price at checkout is the price charged.
      </p>

      <h2 style={SECTION_TITLE}>Your content</h2>
      <p style={BODY}>
        You&rsquo;re responsible for the photos, names, and other content you upload. By
        submitting a photo, you confirm you own the rights to it, or have permission to use it
        (including permission from a parent/guardian if the photo is of a child), and that it
        doesn&rsquo;t infringe anyone else&rsquo;s rights or contain anything unlawful,
        offensive, or inappropriate. We reserve the right to refuse or cancel any order
        containing content that violates this.
      </p>

      <h2 style={SECTION_TITLE}>Production and shipping</h2>
      <p style={BODY}>
        Orders are produced to order after you complete checkout. Standard production and
        shipping is 3–5 business days unless otherwise stated. Shipping timeframes are
        estimates, not guarantees, and we&rsquo;re not responsible for courier delays once an
        order has shipped.
      </p>

      <h2 style={SECTION_TITLE}>NFC functionality</h2>
      <p style={BODY}>
        Products described as NFC-enabled include a physical NFC chip. Functionality available
        via the chip will be described at the time of purchase. [Placeholder — to be finalised
        once the digital profile experience is live.]
      </p>

      <h2 style={SECTION_TITLE}>Returns and reprints</h2>
      <p style={BODY}>
        Because every order is custom-made, we don&rsquo;t offer returns for buyer&rsquo;s
        remorse. If your order arrives damaged, defective, or significantly different from your
        approved design, contact{' '}
        <a href="mailto:hello@emblem.cards" style={{ color: 'var(--accent)' }}>hello@emblem.cards</a>{' '}
        within 14 days of delivery for a free reprint or refund.
      </p>

      <h2 style={SECTION_TITLE}>Limitation of liability</h2>
      <p style={BODY}>
        We provide products &ldquo;as is.&rdquo; To the maximum extent permitted by law, Emblem
        is not liable for indirect or consequential losses arising from use of this site or its
        products.
      </p>

      <h2 style={SECTION_TITLE}>Changes to these terms</h2>
      <p style={BODY}>
        We may update these terms from time to time. Continued use of the site after changes are
        posted means you accept the updated terms.
      </p>

      <h2 style={SECTION_TITLE}>Contact</h2>
      <p style={BODY}>
        <a href="mailto:hello@emblem.cards" style={{ color: 'var(--accent)' }}>hello@emblem.cards</a>
      </p>
    </div>
  );
}
