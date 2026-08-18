import { DISPOSABLE_SQUAD_INVITE_NOTICE } from '@/lib/squad-invite-preview-safety';

export default function DisposableSquadInviteNotice() {
  return (
    <aside
      role="status"
      aria-label="Disposable Squad Invite preview safety notice"
      style={{
        position: 'fixed',
        zIndex: 1000,
        right: 0,
        bottom: 0,
        left: 0,
        width: '100%',
        padding: '9px 14px calc(9px + env(safe-area-inset-bottom))',
        borderTop: '1px solid color-mix(in srgb, var(--orange, #f16633) 45%, transparent)',
        background: 'color-mix(in srgb, var(--ink, #0d0d12) 96%, transparent)',
        color: '#fff',
        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.18)',
        fontFamily: 'var(--font-manrope), system-ui, sans-serif',
        fontSize: 13,
        fontWeight: 700,
        lineHeight: 1.35,
        textAlign: 'center',
        overflowWrap: 'anywhere',
      }}
    >
      {DISPOSABLE_SQUAD_INVITE_NOTICE}
    </aside>
  );
}
