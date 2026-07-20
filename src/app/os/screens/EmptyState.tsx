export default function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div
      style={{
        background: 'var(--os-card)',
        borderRadius: 16,
        padding: '28px 20px',
        textAlign: 'center',
        boxShadow: '0 6px 16px -12px rgba(0,0,0,.2)',
      }}
    >
      <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 16, color: 'var(--os-ink)', marginBottom: 6 }}>
        {title}
      </div>
      <div style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--os-muted)' }}>{body}</div>
    </div>
  );
}
