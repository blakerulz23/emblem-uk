import { SETTINGS_REVIEW_BODY, SETTINGS_REVIEW_COACHING_PAUSED, SETTINGS_REVIEW_TITLE } from '@/lib/account-deletion-copy';

/**
 * Account Settings status while the account's own deletion request is under
 * staff review (migration 0097/0098). Nothing has been deleted; only
 * coaching access may be paused.
 */
export default function DeletionReviewStatus({ coachAccessPaused }: { coachAccessPaused: boolean }) {
  return (
    <div role="status" style={{ border: '1px solid rgba(180,120,20,.35)', background: 'rgba(250,200,80,.12)', borderRadius: 12, padding: '12px 14px', marginBottom: 12 }}>
      <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 16, color: '#7a4b00', marginBottom: 4 }}>{SETTINGS_REVIEW_TITLE}</div>
      <p style={{ fontSize: 12.5, lineHeight: 1.5, margin: 0, color: '#5c4a2a' }}>{SETTINGS_REVIEW_BODY}</p>
      {coachAccessPaused && <p style={{ fontSize: 12.5, lineHeight: 1.5, margin: '6px 0 0', color: '#5c4a2a' }}>{SETTINGS_REVIEW_COACHING_PAUSED}</p>}
    </div>
  );
}
