import { onActivateKey } from '../a11y';

/**
 * Coach Profile's SETTINGS card. Real accounts get one row, Account, which
 * opens Account Settings (sign out, delete account). There are no
 * notification settings for anyone yet (Story Updates, under the bell, are
 * the in-app feed), so real accounts get no Notifications row rather than
 * one that looks tappable and does nothing (rollout finding F3). The
 * public demo keeps its original static rows.
 */
export default function CoachSettingsCard({ isReal, onOpenAccount }: { isReal: boolean; onOpenAccount: () => void }) {
  return (
    <div style={{ background: 'var(--os-card)', borderRadius: 18, padding: '4px 18px', boxShadow: '0 8px 22px -16px rgba(0,0,0,.2)' }}>
      <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.1em', fontSize: 12, color: 'var(--os-muted)', padding: '16px 0 6px' }}>SETTINGS</div>
      {isReal ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Open Account Settings"
          onClick={onOpenAccount}
          onKeyDown={onActivateKey(onOpenAccount)}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 0', borderTop: '1px solid rgba(0,0,0,.05)', cursor: 'pointer' }}
        >
          <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--os-ink)' }}>Account</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B8B0A4" strokeWidth={2.2} strokeLinecap="round"><path d="M9 5l7 7-7 7" /></svg>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 0', borderTop: '1px solid rgba(0,0,0,.05)', cursor: 'pointer' }}><span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--os-ink)' }}>Notifications</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B8B0A4" strokeWidth={2.2} strokeLinecap="round"><path d="M9 5l7 7-7 7" /></svg></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 0', borderTop: '1px solid rgba(0,0,0,.05)', cursor: 'pointer' }}><span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--os-ink)' }}>Account</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B8B0A4" strokeWidth={2.2} strokeLinecap="round"><path d="M9 5l7 7-7 7" /></svg></div>
        </>
      )}
    </div>
  );
}
