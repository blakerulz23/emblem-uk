'use client';

import { useEffect, useState } from 'react';
import { useOsData, useTopImprovements } from '../../OsDataContext';
import { useCountUp } from '../../useCountUp';
import EmptyState from '../EmptyState';

const WHAT_CHANGED = [
  'More confident receiving the ball',
  'Improved awareness before passing',
  'Better movement into space',
];

export default function DevelopmentTab() {
  const { mode, coachSummary: COACH_SUMMARY, developmentSeasons: DEVELOPMENT_SEASONS } = useOsData();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const improvements = useTopImprovements(4);

  if (mode !== 'demo' && DEVELOPMENT_SEASONS.length === 0) {
    return (
      <EmptyState
        title="Development begins this season."
        body="Progress will appear after two or more assessments."
      />
    );
  }

  return (
    <>
      <div style={{ background: 'var(--os-card)', borderRadius: 16, padding: 18, boxShadow: '0 6px 16px -12px rgba(0,0,0,.2)', marginBottom: 14 }}>
        <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.09em', fontSize: 12, color: 'var(--os-muted)', marginBottom: 16 }}>FOOTBALL DEVELOPMENT</div>
        {DEVELOPMENT_SEASONS.map((s) => (
          <SeasonBar key={s.season} season={s.season} overallScore={s.overallScore} active={mounted} />
        ))}
      </div>

      <div style={{ background: 'var(--os-card)', borderRadius: 16, padding: 18, boxShadow: '0 6px 16px -12px rgba(0,0,0,.2)', marginBottom: 14 }}>
        <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.09em', fontSize: 11, color: 'var(--os-muted)', marginBottom: 12 }}>BIGGEST IMPROVEMENTS</div>
        {improvements.map((it) => (
          <div key={it.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
            <span style={{ fontFamily: 'Roboto', fontWeight: 600, fontSize: 13, color: 'var(--os-ink)' }}>{it.label}</span>
            <span style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 13, color: '#2E9E5B' }}>+{it.seasonalChange}</span>
          </div>
        ))}
      </div>

      <div style={{ background: 'var(--os-card)', borderRadius: 16, padding: 18, boxShadow: '0 6px 16px -12px rgba(0,0,0,.2)', marginBottom: 14 }}>
        <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.09em', fontSize: 11, color: 'var(--os-muted)', marginBottom: 12 }}>WHAT CHANGED THIS SEASON</div>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {WHAT_CHANGED.map((c) => (
            <li key={c} style={{ fontSize: 13, color: 'var(--os-ink)', lineHeight: 1.6 }}>{c}</li>
          ))}
        </ul>
      </div>

      {COACH_SUMMARY && (
        <div style={{ background: 'var(--os-card)', borderRadius: 16, padding: 16, boxShadow: '0 6px 16px -12px rgba(0,0,0,.2)', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.09em', fontSize: 11, color: 'var(--os-muted)', marginBottom: 6 }}>COACH RATING</div>
          <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 34, color: '#E97435', lineHeight: 1 }}>{COACH_SUMMARY.rating}</div>
          <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 11, color: '#6B6357', marginTop: 2 }}>out of 10 · a coaching assessment, not part of the calculated overall score</div>
          {COACH_SUMMARY.verified && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#2E9E5B" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
              <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 9.5, letterSpacing: '.05em', color: '#2E9E5B' }}>VERIFIED</span>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function SeasonBar({ season, overallScore, active }: { season: string; overallScore: number; active: boolean }) {
  const rating = useCountUp(overallScore, active);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
      <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 12, color: 'var(--os-muted)', width: 56, flex: '0 0 auto' }}>{season}</span>
      <div style={{ flex: 1, height: 8, borderRadius: 5, background: 'rgba(0,0,0,.07)', overflow: 'hidden' }}>
        <div style={{ width: active ? `${overallScore}%` : '0%', height: '100%', background: 'linear-gradient(90deg,#F26722,#E97435)', transition: 'width .9s cubic-bezier(.2,.7,.2,1)' }} />
      </div>
      <span style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 16, color: 'var(--os-ink)', width: 30, textAlign: 'right' }}>{rating}</span>
    </div>
  );
}
