import type { CSSProperties, ReactNode } from 'react';

export function Screen({
  children,
  footer,
  pad = 22,
  noScroll,
}: {
  children: ReactNode;
  footer?: ReactNode;
  pad?: number;
  noScroll?: boolean;
}) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div
        className="screen-body"
        style={{
          flex: 1,
          overflowY: noScroll ? 'hidden' : 'auto',
          padding: `18px ${pad}px 18px`,
          minHeight: 0,
        }}
      >
        {children}
      </div>
      {footer && (
        <div
          style={{
            flexShrink: 0,
            padding: `12px ${pad}px 30px`,
            background: 'linear-gradient(transparent, #fff 28%)',
          }}
        >
          {footer}
        </div>
      )}
    </div>
  );
}

export function Kicker({
  title,
  sub,
  style,
}: {
  title: string;
  sub?: string;
  style?: CSSProperties;
}) {
  return (
    <div style={{ marginBottom: 22, ...style }}>
      <h1
        style={{
          fontFamily: 'var(--font-sora), system-ui',
          fontSize: 30,
          lineHeight: 1.08,
          fontWeight: 700,
          letterSpacing: '-0.025em',
          color: 'var(--ink)',
          margin: 0,
          textWrap: 'balance' as 'balance',
        }}
      >
        {title}
      </h1>
      {sub && (
        <p
          style={{
            fontFamily: 'var(--font-manrope), system-ui',
            fontSize: 15.5,
            lineHeight: 1.45,
            color: 'var(--ink-soft)',
            margin: '10px 0 0',
            textWrap: 'pretty' as 'pretty',
          }}
        >
          {sub}
        </p>
      )}
    </div>
  );
}
