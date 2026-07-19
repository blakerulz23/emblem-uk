'use client';

import { useEffect, useState } from 'react';
import { onActivateKey } from '../../a11y';
import { HOW_SCORES_WORK_COPY } from '../../scoring';
import { SKILL_CATEGORIES } from '../../playerProfile';
import type { Skill } from '../../playerProfile';
import type { AttrCategory } from '../../types';
import { useCountUp } from '../../useCountUp';
import SkillDetailSheet from './SkillDetailSheet';

export default function SkillsTab({
  activeCategory,
  onSelectCategory,
  onFlipCard,
  flipHint,
}: {
  activeCategory: AttrCategory;
  onSelectCategory: (id: AttrCategory) => void;
  onFlipCard: () => void;
  flipHint: string;
}) {
  const [openSkillId, setOpenSkillId] = useState<string | null>(null);
  const [showScoreInfo, setShowScoreInfo] = useState(false);
  const category = SKILL_CATEGORIES.find((c) => c.id === activeCategory) || SKILL_CATEGORIES[0];
  const categoryScore = useCountUp(category.categoryScore, true);

  return (
    <div style={{ display: 'flex', gap: 12, position: 'relative' }}>
      <div style={{ flex: '0 0 96px' }}>
        {SKILL_CATEGORIES.map((c) => {
          const on = c.id === activeCategory;
          return (
            <div
              key={c.id}
              role="button"
              tabIndex={0}
              aria-pressed={on}
              onClick={() => onSelectCategory(c.id)}
              onKeyDown={onActivateKey(() => onSelectCategory(c.id))}
              style={{ display: 'flex', alignItems: 'center', gap: 7, minHeight: 44, padding: '11px 9px', borderRadius: 11, cursor: 'pointer', marginBottom: 7, background: on ? 'rgba(233,116,53,.1)' : '#fff' }}
            >
              <span style={{ fontSize: 14 }} aria-hidden="true">{c.icon}</span>
              <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 11, letterSpacing: '.04em', color: on ? '#E97435' : '#6B6357' }}>{c.label}</span>
            </div>
          );
        })}
        <div
          role="button"
          tabIndex={0}
          onClick={onFlipCard}
          onKeyDown={onActivateKey(onFlipCard)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, marginTop: 10, padding: '10px 6px', borderRadius: 11, cursor: 'pointer', background: '#15130F', color: '#F4F1EC', fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.08em', fontSize: 10, textTransform: 'uppercase' }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#F4F1EC" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" /></svg>
          {flipHint}
        </div>
      </div>

      <div style={{ flex: 1 }}>
        <div style={{ background: 'var(--os-card)', borderRadius: 13, padding: '13px 14px', boxShadow: '0 5px 14px -12px rgba(0,0,0,.25)', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 15, color: 'var(--os-ink)' }}>{category.label}</span>
            <span style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 24, color: '#E97435' }}>{categoryScore}</span>
          </div>
          <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 10.5, letterSpacing: '.04em', color: '#8A8378', marginTop: 2 }}>
            Top {category.leaguePercentile}% in league
          </div>
        </div>

        {category.skills.map((skill) => (
          <SkillRow key={skill.id} skill={skill} onOpen={() => setOpenSkillId(skill.id)} />
        ))}

        <div
          role="button"
          tabIndex={0}
          aria-expanded={showScoreInfo}
          onClick={() => setShowScoreInfo((v) => !v)}
          onKeyDown={onActivateKey(() => setShowScoreInfo((v) => !v))}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '8px 2px', marginTop: 4, cursor: 'pointer' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8A8378" strokeWidth={1.8}><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></svg>
          <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 11, letterSpacing: '.06em', color: '#8A8378', textTransform: 'uppercase' }}>How scores work</span>
        </div>
        {showScoreInfo && (
          <p style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--os-muted)', background: 'var(--os-card)', borderRadius: 11, padding: '12px 14px', margin: '4px 0 0' }}>
            {HOW_SCORES_WORK_COPY}
          </p>
        )}
      </div>

      {openSkillId && <SkillDetailSheet skillId={openSkillId} onClose={() => setOpenSkillId(null)} />}
    </div>
  );
}

function SkillRow({ skill, onOpen }: { skill: Skill; onOpen: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const score = useCountUp(skill.score, mounted);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={onActivateKey(onOpen)}
      aria-label={`${skill.label}, score ${skill.score}, up ${skill.seasonalChange} this season. View details.`}
      style={{ background: 'var(--os-card)', borderRadius: 13, padding: '12px 13px', minHeight: 44, boxShadow: '0 5px 14px -12px rgba(0,0,0,.25)', marginBottom: 9, cursor: 'pointer' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
        <span style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 12.5, color: 'var(--os-ink)' }}>{skill.label}</span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 17, color: 'var(--os-ink)' }}>{score}</span>
          <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 10, color: '#2E9E5B' }}>↑{skill.seasonalChange}</span>
        </div>
      </div>
      <div style={{ height: 6, borderRadius: 5, background: 'rgba(0,0,0,.07)', overflow: 'hidden' }}>
        <div
          style={{
            width: mounted ? `${skill.score}%` : '0%',
            height: '100%',
            background: 'linear-gradient(90deg,#F26722,#E97435)',
            borderRadius: 5,
            transition: 'width .8s cubic-bezier(.2,.7,.2,1)',
          }}
        />
      </div>
    </div>
  );
}
