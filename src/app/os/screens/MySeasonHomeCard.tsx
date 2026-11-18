import type { Ref } from 'react';
import { formatMySeasonDate, mySeasonCategory, observationAuthor, visibleFamilyObservations, type MySeasonContent } from '@/lib/my-season';
import { MY_SEASON_COPY, MsButton, msEyebrow, msWrap } from '../mySeasonUi';

/**
 * Home's "This Season" My Season card (guardian view, feature enabled
 * only). Not itself a button: the one control is the real "Open" button,
 * so there is no nested interactive element. `openRef` lets Home put focus
 * back on Open when the My Season screen closes.
 */
export default function MySeasonHomeCard({ view, onOpen, openRef }: { view: MySeasonContent; onOpen: () => void; openRef?: Ref<HTMLButtonElement> }) {
  const latest = visibleFamilyObservations(view)[0] ?? null;
  const cat = latest ? mySeasonCategory(latest.category) : null;
  return (
    <section
      aria-labelledby="ms-home-h"
      data-testid="my-season-home-card"
      // minmax(0, 1fr): a long unbroken title or note must not widen the column.
      style={{ background: 'var(--os-card)', borderRadius: 18, padding: 16, marginTop: 12, boxShadow: '0 8px 20px -16px rgba(0,0,0,.2)', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10, minWidth: 0 }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, minWidth: 0 }}>
        <h3 id="ms-home-h" style={{ margin: 0, fontFamily: 'Roboto', fontWeight: 800, fontSize: 15, color: 'var(--os-ink)' }}>My Season</h3>
        <span className="os-ms-accent" style={{ ...msEyebrow, fontSize: 11.5 }}>My Focus</span>
      </div>
      <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 18, lineHeight: 1.2, color: 'var(--os-ink)', ...msWrap }}>
        {view.activeFocus ? view.activeFocus.title : MY_SEASON_COPY.noFocus}
      </div>
      {latest && cat ? (
        <div style={{ borderTop: '1px solid var(--os-border)', paddingTop: 10, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--os-ink)', ...msWrap }}>
            <span aria-hidden="true">{cat.emoji}</span> {cat.label}
          </div>
          <q style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', margin: '2px 0 4px', fontSize: 14, lineHeight: 1.4, color: 'var(--os-ink)', ...msWrap }}>
            {latest.body}
          </q>
          <div className="os-ms-soft" style={{ fontSize: 12.5, ...msWrap }}>
            {observationAuthor(latest)} · {formatMySeasonDate(latest.createdAt)}
          </div>
        </div>
      ) : (
        <div className="os-ms-soft" style={{ fontSize: 13.5 }}>No coach notes yet.</div>
      )}
      <MsButton buttonRef={openRef} onClick={onOpen} ariaLabel="Open My Season" style={{ justifySelf: 'start' }}>Open</MsButton>
    </section>
  );
}
