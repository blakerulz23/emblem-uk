import UnsuspendCardButton from './UnsuspendCardButton';

/**
 * Rendered by page.tsx in place of the ordinary OS shell, only for the one
 * case that needs it: a physical tap from the linked guardian themselves on
 * a card that is currently suspended or revoked (migration 0075). Every
 * other tapper (stranger, unrelated authenticated account, or a card with
 * no linked player at all) never reaches this component — page.tsx already
 * filters that in the isGuardian check before rendering it. Deliberately
 * self-contained (no OsApp/phone-frame chrome) since it's a single-purpose
 * safety screen, not a normal OS surface.
 */
export default function CardAccessNotice({
  cardId,
  accessStatus,
}: {
  cardId: string;
  accessStatus: 'suspended' | 'revoked';
}) {
  return (
    <div
      style={{
        minHeight: '100dvh',
        background: 'var(--os-screen, #F4F2EE)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '28px 20px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          background: 'var(--os-card, #ffffff)',
          borderRadius: 20,
          padding: '32px 24px',
          textAlign: 'center',
          boxShadow: '0 12px 30px -14px rgba(0,0,0,.2)',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: 'rgba(233,116,53,.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            fontSize: 22,
          }}
        >
          {accessStatus === 'suspended' ? '⏸' : '🔒'}
        </div>
        {accessStatus === 'suspended' ? (
          <>
            <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 18, color: 'var(--os-ink, #15130F)', marginBottom: 8 }}>
              This card is suspended
            </div>
            <p style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--os-muted, #8A8378)', margin: '0 0 20px' }}>
              You or a member of staff paused this card. Your child&apos;s profile is safe — nobody else can see it while
              it&apos;s suspended. Turn it back on any time.
            </p>
            <UnsuspendCardButton cardId={cardId} />
          </>
        ) : (
          <>
            <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 18, color: 'var(--os-ink, #15130F)', marginBottom: 8 }}>
              This card is no longer active
            </div>
            <p style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--os-muted, #8A8378)', margin: 0 }}>
              This card has been permanently deactivated. If it was replaced, use your new card instead. If you&apos;re
              not sure why, contact us and we can help.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
