'use client';

import { useEmblem } from '@/context/EmblemContext';
import { Screen, Kicker } from '../Screen';
import { Btn, Mono } from '../primitives';
import PuzzleArt from '../PuzzleArt';
import { CARD_TEMPLATES, type CardTemplate, type PuzzleStyle } from '../data';

// Three quick template options for Card style — same family the cards use
const FEATURED_TEMPLATES = ['galaxy-holo', 'chrome-legacy', 'futuristic-bold'];

export default function PuzzleEditScreen() {
  const { photo, details, puzzle, setPuzzle, next } = useEmblem();
  const tplByID = (id: string): CardTemplate =>
    CARD_TEMPLATES.find((t) => t.id === id) || CARD_TEMPLATES[0];
  const currentTemplate = tplByID(puzzle.templateId);

  return (
    <Screen
      footer={
        <Btn full kind="primary" icon="check" onClick={next}>
          Continue to review
        </Btn>
      }
    >
      <Kicker
        title="Make your puzzle"
        sub="Choose a style. 100 pieces, 330×420mm premium print."
      />

      {/* Style toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {([
          { id: 'photo' as PuzzleStyle, label: 'Photo' },
          { id: 'card' as PuzzleStyle, label: 'Trading Card' },
        ]).map((s) => {
          const active = puzzle.style === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setPuzzle({ style: s.id })}
              style={{
                flex: 1,
                padding: '12px 16px',
                background: active ? 'var(--accent-tint)' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--ink-soft)',
                border: '1px solid ' + (active ? 'var(--accent)' : 'var(--line)'),
                borderRadius: 12,
                fontFamily: 'var(--font-sora), system-ui',
                fontWeight: 700,
                fontSize: 13,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {/* Template picker, only when Card style */}
      {puzzle.style === 'card' && (
        <div style={{ marginBottom: 16 }}>
          <Mono style={{ fontSize: 11, color: 'var(--ink-faint)', marginBottom: 8, letterSpacing: '0.08em' }}>
            TEMPLATE
          </Mono>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
            {FEATURED_TEMPLATES.map((tid) => {
              const t = tplByID(tid);
              const active = puzzle.templateId === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setPuzzle({ templateId: t.id })}
                  style={{
                    flexShrink: 0,
                    padding: 4,
                    background: 'transparent',
                    border: '2px solid ' + (active ? 'var(--accent)' : 'transparent'),
                    borderRadius: 12,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ width: 64, height: 80, borderRadius: 6, overflow: 'hidden', background: '#1a1a23' }}>
                    <PuzzleArt style="card" template={t} photo={photo} details={details} size={64} />
                  </div>
                  <Mono style={{ fontSize: 9, color: 'var(--ink-faint)', marginTop: 4, textAlign: 'center' }}>
                    {t.family}
                  </Mono>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Live preview */}
      <div style={{ display: 'grid', placeItems: 'center', padding: '12px 0' }}>
        <PuzzleArt
          style={puzzle.style}
          template={currentTemplate}
          photo={photo}
          details={details}
          size={280}
        />
      </div>
    </Screen>
  );
}
