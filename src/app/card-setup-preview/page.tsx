'use client';
import { useState } from 'react';

export default function CardSetupChoicePreview() {
  const [choice, setChoice] = useState<'self_serve' | 'staff_done_for_you'>('self_serve');

  return (
    <div className="mx-auto max-w-xl px-4 sm:px-6 lg:px-8 py-14">
      <span
        style={{
          fontFamily: 'var(--font-jbmono), monospace',
          fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase',
          color: 'var(--accent)', background: 'var(--accent-tint)',
          padding: '6px 12px', borderRadius: 999, display: 'inline-block',
        }}
      >
        Preview only · not wired into checkout
      </span>

      <h1
        style={{
          fontFamily: 'var(--font-sora), system-ui', fontWeight: 800,
          fontSize: 28, letterSpacing: '-0.02em', color: 'var(--ink)', margin: '18px 0 6px',
        }}
      >
        Digital profile setup
      </h1>
      <p style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 15, color: 'var(--ink-soft)', margin: 0 }}>
        Every card taps to a live profile page. Choose how you want yours set up.
      </p>

      <div style={{ marginTop: 24, display: 'grid', gap: 12 }}>
        <button
          onClick={() => setChoice('self_serve')}
          style={{
            textAlign: 'left', padding: '18px 20px', borderRadius: 16, cursor: 'pointer',
            background: choice === 'self_serve' ? 'var(--accent-tint)' : '#fff',
            border: '2px solid ' + (choice === 'self_serve' ? 'var(--accent)' : 'var(--line)'),
          }}
        >
          <div style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 16, color: 'var(--ink)' }}>
            Set it up myself
          </div>
          <div style={{ marginTop: 4, fontFamily: 'var(--font-manrope), system-ui', fontSize: 13.5, color: 'var(--ink-soft)' }}>
            Goes live immediately with the info you entered in the builder. Free.
          </div>
        </button>

        <button
          onClick={() => setChoice('staff_done_for_you')}
          style={{
            textAlign: 'left', padding: '18px 20px', borderRadius: 16, cursor: 'pointer',
            background: choice === 'staff_done_for_you' ? 'var(--accent-tint)' : '#fff',
            border: '2px solid ' + (choice === 'staff_done_for_you' ? 'var(--accent)' : 'var(--line)'),
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 16, color: 'var(--ink)' }}>
              Let Emblem build it for me
            </div>
            <div style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 800, fontSize: 16, color: 'var(--accent)' }}>
              +$5
            </div>
          </div>
          <div style={{ marginTop: 4, fontFamily: 'var(--font-manrope), system-ui', fontSize: 13.5, color: 'var(--ink-soft)' }}>
            Our team builds out your profile &mdash; stats and highlights for a player card, a smart link for an artist, a bio for a professional, whatever fits &mdash; and personally verifies the NFC chip works before it ships. Live within 1 business day.
          </div>
        </button>
      </div>

      <div
        style={{
          marginTop: 24, padding: '14px 16px', borderRadius: 12,
          background: 'var(--surface)', fontFamily: 'var(--font-jbmono), monospace', fontSize: 12.5, color: 'var(--ink-soft)',
        }}
      >
        Selected: <strong style={{ color: 'var(--ink)' }}>{choice === 'self_serve' ? 'Set it up myself' : 'Let Emblem build it for me (+$5)'}</strong>
        <br />
        This selection isn&rsquo;t saved anywhere yet — it&rsquo;s just here so you can see how the choice would look and feel at checkout.
      </div>
    </div>
  );
}
