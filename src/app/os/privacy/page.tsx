/**
 * Emblem OS — Privacy notice.
 *
 * DRAFT. Not legally reviewed. This page exists so a solicitor / DPO can
 * see how the codebase describes its own data handling and mark it up.
 * See docs/compliance/children-data-checklist.md's "Transparency"
 * standard — this closes that ❌ once a lawyer has signed it off and any
 * placeholder details (Lauda Collective's registered address, DPO email,
 * ICO complaint route) are filled in.
 *
 * The wording deliberately avoids marketing language — this is intended
 * as a plain-English notice a parent can actually read before agreeing
 * to store their child's data.
 */
export const metadata = {
  title: 'Emblem OS — Privacy',
  description: 'How Emblem OS handles data, including data about children.',
};

export default function OsPrivacyPage() {
  return (
    <main
      style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: '48px 24px 96px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        color: '#100E0C',
        lineHeight: 1.6,
      }}
    >
      <div
        style={{
          padding: '10px 14px',
          background: 'rgba(233,116,53,.08)',
          border: '1px solid rgba(233,116,53,.35)',
          borderRadius: 10,
          color: '#B85A20',
          fontSize: 13,
          marginBottom: 24,
        }}
      >
        <strong>Draft — pending legal review.</strong> This notice describes
        how the code as written handles data. It has not been reviewed by a
        solicitor or Data Protection Officer and must be before real
        families use Emblem OS.
      </div>

      <h1 style={{ fontSize: 32, fontWeight: 900, marginBottom: 8 }}>
        Emblem OS privacy notice
      </h1>
      <p style={{ color: '#6B6357', fontSize: 14, marginBottom: 32 }}>
        Last updated: <em>[fill in on publication]</em>
      </p>

      <Section title="Who this notice covers">
        <p>
          This notice is about <strong>Emblem OS</strong> — the app a family
          uses after buying an Emblem NFC card, at{' '}
          <code>emblem-uk.vercel.app/os</code>. If you're looking for the
          privacy notice covering the online shop where cards are ordered,
          see the main site's <a href="/privacy">Privacy</a> page — that
          covers checkout, not the child profile you build with the card.
        </p>
      </Section>

      <Section title="Who's responsible">
        <p>
          <strong>Lauda Collective Ltd</strong> is the data controller for
          the data described here. Contact:{' '}
          <em>[registered office address — fill in]</em>. Data protection
          questions:{' '}
          <em>[privacy@lauda.example — fill in with a real, monitored
          address]</em>.
        </p>
      </Section>

      <Section title="Data we collect about a child">
        <p>The player record includes:</p>
        <ul>
          <li>Their name, playing position, age, height, and preferred foot</li>
          <li>
            The NFC card ID linking a physical Emblem card to the profile
          </li>
          <li>
            Photos and videos of moments a guardian or coach uploads
          </li>
          <li>
            Coach-entered skill assessments (a 1–10 score, a short comment,
            and which match it refers to)
          </li>
        </ul>
        <p>
          We do <strong>not</strong> collect a child's address, school,
          location, contact details, or any behavioural tracking data. The
          skill scores are entered by a coach — they are not inferred by
          the app from how the child uses it.
        </p>
      </Section>

      <Section title="Who can see what">
        <p>
          Every table has row-level security. In plain English:
        </p>
        <ul>
          <li>
            A parent or guardian can only see their linked child's data.
          </li>
          <li>
            A coach can only see players on teams they've been assigned to.
          </li>
          <li>
            No child's profile is ever publicly visible. Media links time
            out and are private.
          </li>
          <li>
            We do not sell, share, or provide any child's data to third
            parties for marketing, advertising, analytics, or profiling.
          </li>
        </ul>
      </Section>

      <Section title="Where data is stored">
        <p>
          Player records, profiles, and skill data live in a UK-hosted
          Supabase (Postgres) database in the London (eu-west-2) AWS
          region. Photos and videos are stored in an AWS S3 bucket.{' '}
          <em>
            [confirm whether S3 bucket is UK-hosted before this notice
            goes live — currently the shared bucket is ap-southeast-2
            (Sydney); the compliance follow-up is to move UK moment media
            to eu-west-2]
          </em>
        </p>
      </Section>

      <Section title="How long we keep it">
        <p>
          <em>
            [To be finalised. The current default is "for as long as the
            account exists"; a guardian can request deletion at any time
            and it cascades to all their linked child's records. A formal
            retention policy with automatic deletion after a period of
            inactivity is being drafted.]
          </em>
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          As the parent or guardian of a child using Emblem OS, you can:
        </p>
        <ul>
          <li>
            <strong>See what we hold</strong> — request an export of all
            your linked child's data.
          </li>
          <li>
            <strong>Correct it</strong> — ask us to change anything that's
            wrong.
          </li>
          <li>
            <strong>Delete it</strong> — request removal of any moment,
            media file, or the whole profile.
          </li>
          <li>
            <strong>Complain</strong> — to us in the first instance, or to
            the UK{' '}
            <a
              href="https://ico.org.uk/make-a-complaint/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Information Commissioner's Office
            </a>
            .
          </li>
        </ul>
        <p>
          Email <em>[privacy@lauda.example]</em> to exercise any of these.
        </p>
      </Section>

      <Section title="The Children's Code">
        <p>
          Emblem OS is designed against the UK ICO's{' '}
          <a
            href="https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Age Appropriate Design Code
          </a>
          . Our internal checklist for how each standard is addressed is
          maintained alongside the code so anyone auditing us can see
          exactly where each choice was made. Notable choices:
        </p>
        <ul>
          <li>
            No engagement mechanics aimed at children — no XP, coins,
            levels, streaks, or public leaderboards of children.
          </li>
          <li>
            The child is not the account holder. Their parent or guardian
            holds the account and consents on their behalf.
          </li>
          <li>
            The NFC card is a passive identifier — it doesn't collect data
            itself.
          </li>
        </ul>
      </Section>

      <Section title="Changes to this notice">
        <p>
          If we change how we handle a child's data in a way that affects
          you, we'll notify the guardian's email on file before the change
          takes effect.
        </p>
      </Section>

      <p style={{ color: '#6B6357', fontSize: 12.5, marginTop: 48 }}>
        This notice was last written by the engineering team. A qualified
        solicitor / Data Protection Officer must review it before this
        page is linked from a live product surface.
      </p>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>{title}</h2>
      <div style={{ fontSize: 15 }}>{children}</div>
    </section>
  );
}
