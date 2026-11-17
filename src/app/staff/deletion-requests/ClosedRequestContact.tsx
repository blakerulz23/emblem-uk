'use client';

/**
 * Migration 0097: a child-deletion request keeps its contact address only
 * while it is pending; the database clears it in the same write that
 * completes or rejects the request. This panel shows the address one last
 * time, from what the page already had, so staff can reply. Nothing here
 * stores it, and the page no longer has it after "Done".
 */
export default function ClosedRequestContact({
  outcome,
  contactEmail,
  onDone,
}: {
  outcome: 'completed' | 'rejected';
  contactEmail: string | null;
  onDone: () => void;
}) {
  const what = outcome === 'completed' ? 'confirming what was removed' : 'explaining why the request was declined';
  return (
    <div
      role="status"
      style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 280, maxWidth: 340 }}
    >
      <div style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 13, color: 'var(--ink)' }}>
        {outcome === 'completed' ? 'Erasure complete.' : 'Request rejected.'}
      </div>
      {contactEmail ? (
        <div style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 12.5, color: 'var(--ink)' }}>
          Reply to <strong style={{ wordBreak: 'break-all' }}>{contactEmail}</strong> now, {what}. The address has been removed from the request and
          won&rsquo;t be shown again.
        </div>
      ) : (
        <div style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 12.5, color: 'var(--ink)' }}>
          No contact address was on file for this request.
        </div>
      )}
      <button
        type="button"
        onClick={onDone}
        style={{ alignSelf: 'flex-start', fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 12.5, color: 'var(--ink)', background: 'var(--bg, #fff)', padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border)', cursor: 'pointer' }}
      >
        Done
      </button>
    </div>
  );
}
