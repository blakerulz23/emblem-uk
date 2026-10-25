// Local style tokens for the partner pages — the same self-contained
// pattern as src/app/trust-and-safeguarding/page.tsx.

export const EYEBROW = {
  fontFamily: 'var(--font-jbmono), monospace',
  fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase' as const,
  color: 'var(--accent)', background: 'var(--accent-tint)',
  padding: '6px 12px', borderRadius: 999, display: 'inline-block',
};

export const H1 = {
  fontFamily: 'var(--font-sora), system-ui', fontWeight: 800,
  fontSize: 'clamp(30px, 5vw, 42px)', lineHeight: 1.08, letterSpacing: '-0.02em',
  color: 'var(--ink)', margin: '24px 0 0',
};

export const H2 = {
  fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 20,
  letterSpacing: '-0.01em', color: 'var(--ink)', marginTop: 36, marginBottom: 10,
};

export const BODY = {
  fontFamily: 'var(--font-manrope), system-ui', fontSize: 15.5, lineHeight: 1.7, color: 'var(--ink-soft)',
};

export const BOX = {
  fontFamily: 'var(--font-manrope), system-ui', fontSize: 15, lineHeight: 1.7, color: 'var(--ink)',
  background: 'var(--accent-tint)', border: '1px solid var(--accent)', borderRadius: 16, padding: '18px 20px', marginTop: 20,
};

export const BUTTON = {
  fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 15,
  color: '#fff', background: 'var(--accent)', padding: '12px 20px', borderRadius: 12, border: 'none',
  cursor: 'pointer', display: 'inline-block', textDecoration: 'none',
};

export const INPUT = {
  fontFamily: 'var(--font-manrope), system-ui', fontSize: 15, color: 'var(--ink)',
  width: '100%', padding: '11px 12px', borderRadius: 10, border: '1px solid var(--line, #d6d3d1)', background: '#fff',
};

export const LABEL = {
  fontFamily: 'var(--font-sora), system-ui', fontWeight: 600, fontSize: 14, color: 'var(--ink)', display: 'block', marginBottom: 6,
};
