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
        Emblem (&ldquo;we&rdquo;, &ldquo;us&rdquo;) operates emblem.cards. This policy explains
        what we collect when you use the site or place an order, and what we do with it. Emblem
        is currently operated as a trading name; formal company registration details will be
        added here once finalised.
      </p>

      <h2 style={SECTION_TITLE}>What we collect</h2>
      <ul style={{ ...BODY, paddingLeft: 20, display: 'grid', gap: 8 }}>
        <li>
          <strong style={{ color: 'var(--ink)' }}>Photos you upload</strong> — used to build your
          custom product (card, poster, sticker, etc.) and, where you choose an AI-styled product
          (plushie, bobblehead, figurine, pendant, coin), processed by a third-party AI image
          service to generate the design.
        </li>
        <li>
          <strong style={{ color: 'var(--ink)' }}>Details you enter</strong> — name, jersey
          number, team, position, and any other text you add to your design.
        </li>
        <li>
          <strong style={{ color: 'var(--ink)' }}>Order and shipping information</strong> — name,
          email, delivery address. This is collected and processed by Shopify, our checkout
          provider, not stored on our own servers.
        </li>
        <li>
          <strong style={{ color: 'var(--ink)' }}>Generated print files</strong> — once you build
          a design, we render it into a print-ready file and store it temporarily on secure cloud
          storage (Amazon S3) solely to produce and ship your order.
        </li>
      </ul>
      <p style={{ ...BODY, marginTop: 14 }}>
        We do not currently use analytics, advertising, or tracking cookies on this site. If that
        changes, this policy will be updated first.
      </p>

      <h2 style={SECTION_TITLE}>Photos of children</h2>
      <p style={BODY}>
        Many of our products are designed for youth athletes. If you upload a photo of a child,
        you confirm that you are their parent or legal guardian, or that you otherwise have the
        right and consent to use that photo for this purpose. We do not knowingly collect data
        directly from children — all uploads and account information come from the adult placing
        the order.
      </p>

      <h2 style={SECTION_TITLE}>Who we share data with</h2>
      <ul style={{ ...BODY, paddingLeft: 20, display: 'grid', gap: 8 }}>
        <li><strong style={{ color: 'var(--ink)' }}>Shopify</strong> — processes your order, payment, and shipping details under their own privacy policy.</li>
        <li><strong style={{ color: 'var(--ink)' }}>Our AI image processing provider</strong> — receives uploaded photos only for products using AI-generated styling, solely to produce your design.</li>
        <li><strong style={{ color: 'var(--ink)' }}>Amazon Web Services (S3)</strong> — stores generated print files temporarily for production and fulfilment.</li>
      </ul>
      <p style={{ ...BODY, marginTop: 14 }}>
        We do not sell your data, and we do not share it with anyone else for marketing purposes.
      </p>

      <h2 style={SECTION_TITLE}>How long we keep it</h2>
      <p style={BODY}>
        Print files and uploaded photos are retained only as long as needed to produce and fulfil
        your order, and are deleted on a routine basis afterward. Order and payment records are
        retained by Shopify in line with their policies and applicable law (e.g. tax record
        requirements).
      </p>

      <h2 style={SECTION_TITLE}>Your rights (UK GDPR)</h2>
      <p style={BODY}>
        If you&rsquo;re in the UK or EU, you have the right to access, correct, or request
        deletion of your personal data, and to object to how we process it. To exercise any of
        these rights, contact us at{' '}
        <a href="mailto:hello@emblem.cards" style={{ color: 'var(--accent)' }}>hello@emblem.cards</a>.
      </p>

      <h2 style={SECTION_TITLE}>Contact</h2>
      <p style={BODY}>
        Questions about this policy:{' '}
        <a href="mailto:hello@emblem.cards" style={{ color: 'var(--accent)' }}>hello@emblem.cards</a>
      </p>
    </div>
  );
}
