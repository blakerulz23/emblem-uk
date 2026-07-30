'use client';

import { onActivateKey } from '../a11y';

export type StoryUpdateFilter = 'all' | 'coach' | 'collection' | 'family' | 'unread';

const CHIPS: { key: StoryUpdateFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'coach', label: 'Coach' },
  { key: 'collection', label: 'Collection' },
  { key: 'family', label: 'Family' },
  { key: 'unread', label: 'Unread' },
];

/**
 * A horizontal filter row — visual lineage from the existing demo role-
 * toggle pill (OsApp.tsx) and CelebrateSheet's selectable-toggle pattern,
 * not a new visual language. Transitions animate via plain CSS (background/
 * color/border-color), no animation library needed for five small chips.
 */
export default function StoryUpdateChips({ active, onChange }: { active: StoryUpdateFilter; onChange: (filter: StoryUpdateFilter) => void }) {
  return (
    <div role="tablist" aria-label="Filter Story Updates" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2, marginBottom: 14 }}>
      {CHIPS.map((chip) => {
        const isActive = active === chip.key;
        return (
          <div
            key={chip.key}
            role="tab"
            aria-selected={isActive}
            tabIndex={0}
            onClick={() => onChange(chip.key)}
            onKeyDown={onActivateKey(() => onChange(chip.key))}
            style={{
              flex: '0 0 auto',
              padding: '8px 16px',
              borderRadius: 999,
              cursor: 'pointer',
              fontFamily: 'Roboto',
              fontWeight: 700,
              fontSize: 13,
              background: isActive ? '#E97435' : 'rgba(233,116,53,.1)',
              color: isActive ? '#fff' : '#C4501C',
              border: isActive ? '1px solid #E97435' : '1px solid rgba(233,116,53,.3)',
              transition: 'background .2s ease, color .2s ease, border-color .2s ease',
              whiteSpace: 'nowrap',
            }}
          >
            {chip.label}
          </div>
        );
      })}
    </div>
  );
}
