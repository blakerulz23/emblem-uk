import Icon from './Icon';
import { Mono } from './primitives';
import type { Details, ProductId } from './data';

export default function ProductMock({
  product,
  photo,
  details,
  accent,
  size = 220,
}: {
  product: ProductId;
  photo: string | null;
  details: Details | null;
  accent: string;
  size?: number;
}) {
  const d = details || ({} as Partial<Details>);

  if (product === 'posters') {
    return (
      <div
        style={{
          width: size,
          height: size * 1.33,
          borderRadius: 10,
          overflow: 'hidden',
          position: 'relative',
          background: '#0b0b0f',
          boxShadow: '0 14px 36px rgba(0,0,0,.22)',
          flexShrink: 0,
        }}
      >
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt=""
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center 25%',
            }}
          />
        )}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(transparent 45%, rgba(0,0,0,.75))',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: '50%',
            bottom: '7%',
            transform: 'translateX(-50%)',
            textAlign: 'center',
            color: '#fff',
            width: '90%',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-sora), system-ui',
              fontWeight: 800,
              fontSize: size * 0.16,
              lineHeight: 0.95,
              letterSpacing: '-0.02em',
              textTransform: 'uppercase',
            }}
          >
            {d.name || 'Your Name'}
          </div>
          <div
            style={{
              height: 3,
              width: 44,
              background: accent,
              margin: '10px auto',
              borderRadius: 2,
            }}
          />
          <Mono
            style={{
              fontSize: size * 0.045,
              color: 'rgba(255,255,255,.8)',
            }}
          >
            {(d.team || 'TEAM') + ' · #' + (d.number || '00')}
          </Mono>
        </div>
      </div>
    );
  }

  if (product === 'wristbands') {
    return (
      <div
        style={{
          width: size,
          height: size * 0.42,
          borderRadius: 999,
          background: accent,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 22px',
          color: '#fff',
          boxShadow: '0 14px 30px rgba(0,0,0,.18), inset 0 -3px 10px rgba(0,0,0,.18)',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-sora), system-ui',
            fontWeight: 800,
            fontSize: size * 0.085,
            textTransform: 'uppercase',
            letterSpacing: '0.02em',
          }}
        >
          {d.name || 'Your Name'}
        </span>
        <span style={{ color: 'rgba(255,255,255,.9)' }}>
          <Icon name="nfc" size={size * 0.1} />
        </span>
      </div>
    );
  }

  if (product === 'keychains') {
    return (
      <div style={{ width: size * 0.7, position: 'relative', flexShrink: 0 }}>
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: 999,
            border: '4px solid #c9ccd2',
            margin: '0 auto -6px',
          }}
        />
        <div
          style={{
            width: '100%',
            aspectRatio: '1/1.25',
            borderRadius: 16,
            overflow: 'hidden',
            position: 'relative',
            background: '#0b0b0f',
            boxShadow: '0 12px 28px rgba(0,0,0,.2)',
          }}
        >
          {photo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo}
              alt=""
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: 'center 22%',
              }}
            />
          )}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              boxShadow: 'inset 0 0 0 4px rgba(255,255,255,.85)',
              borderRadius: 16,
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: 8,
              left: 0,
              right: 0,
              textAlign: 'center',
              color: '#fff',
              fontFamily: 'var(--font-sora), system-ui',
              fontWeight: 800,
              fontSize: size * 0.07,
              textShadow: '0 1px 6px rgba(0,0,0,.6)',
            }}
          >
            {d.name || 'Your Name'}
          </div>
        </div>
      </div>
    );
  }

  // stickers — a little spread
  return (
    <div style={{ position: 'relative', width: size, height: size * 0.95, flexShrink: 0 }}>
      {[
        { r: -14, x: -8, y: 8, dark: true },
        { r: 9, x: size * 0.34, y: -4, dark: false },
      ].map((t, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: t.x,
            top: t.y,
            transform: `rotate(${t.r}deg)`,
            width: size * 0.6,
            aspectRatio: '1/1.2',
            borderRadius: 18,
            overflow: 'hidden',
            background: t.dark ? '#0b0b0f' : accent,
            boxShadow: '0 10px 24px rgba(0,0,0,.2)',
            border: '5px solid #fff',
          }}
        >
          {photo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo}
              alt=""
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: 'center 22%',
                opacity: t.dark ? 1 : 0.9,
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
