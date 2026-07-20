/**
 * Emblem OS — Terms of use (draft).
 *
 * DRAFT. Not legally reviewed. See docs/compliance/children-data-checklist.md.
 * Sits alongside /os/privacy and covers what a guardian or coach is
 * agreeing to when they sign in. Intentionally short — this is the
 * baseline; a solicitor will expand or restructure as needed.
 */
export const metadata = {
  title: 'Emblem OS — Terms of use',
};

export default function OsTermsPage() {
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
        <strong>Draft — pending legal review.</strong> This describes the
        rules the current build enforces. A solicitor must sign it off
        before real families use Emblem OS.
      </div>

      <h1 style={{ fontSize: 32, fontWeight: 900, marginBottom: 24 }}>
        Emblem OS terms of use
      </h1>

      <Section title="Who can use Emblem OS">
        <p>
          Emblem OS accounts belong to <strong>parents, guardians, and
          coaches</strong>. If you are under 18, please ask a parent or
          guardian to set up the account for you.
        </p>
      </Section>

      <Section title="If you're a parent or guardian">
        <p>By using Emblem OS on a child's behalf, you confirm:</p>
        <ul>
          <li>
            You are the child's parent or legal guardian, or have that
            guardian's permission to manage the child's Emblem profile.
          </li>
          <li>
            You consent, on the child's behalf, to Lauda Collective storing
            the data described in our{' '}
            <a href="/os/privacy">privacy notice</a>.
          </li>
          <li>
            Any photos or videos you upload are yours to share, or you have
            permission from the person who took them.
          </li>
          <li>
            You will not upload media containing other children without
            those children's guardians' permission.
          </li>
        </ul>
      </Section>

      <Section title="If you're a coach">
        <p>By using Emblem OS as a coach, you confirm:</p>
        <ul>
          <li>
            You are the recognised coach of the teams assigned to you.
          </li>
          <li>
            Skill assessments and recognitions you record are your own
            professional judgement.
          </li>
          <li>
            You will not share individual players' profile data outside
            the coaching relationship (e.g. with rival clubs, media, or
            social platforms).
          </li>
        </ul>
      </Section>

      <Section title="Moderation">
        <p>
          A moment uploaded by a parent doesn't appear as a verified part
          of the child's collection until a coach on the team approves it.
          Coaches can reject a moment if it doesn't belong in the profile
          — the rejected item is retained so any dispute can be resolved.
        </p>
      </Section>

      <Section title="Things we don't allow">
        <ul>
          <li>
            Uploading media of children who aren't linked to your account
            without their guardians' consent.
          </li>
          <li>
            Sharing sign-in codes or other account credentials with
            anyone.
          </li>
          <li>
            Attempting to access another family's or team's data.
          </li>
        </ul>
      </Section>

      <Section title="Ending your use">
        <p>
          You can request deletion of your account at any time by emailing{' '}
          <em>[privacy@lauda.example]</em>. Deleting a guardian account
          removes any child records only linked to that guardian; children
          with multiple linked guardians remain, minus your access.
        </p>
      </Section>

      <Section title="Liability">
        <p>
          <em>
            [To be drafted by a solicitor. Baseline: nothing in these terms
            limits your statutory rights. Lauda Collective is not
            responsible for a coach's professional judgement in skill
            assessments.]
          </em>
        </p>
      </Section>

      <p style={{ color: '#6B6357', fontSize: 12.5, marginTop: 48 }}>
        These terms were drafted by the engineering team. A qualified
        solicitor must review them before this page is linked from a live
        product surface.
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
