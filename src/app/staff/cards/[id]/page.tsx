import { redirect, notFound } from 'next/navigation';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';
import CardLifecycleActions from './CardLifecycleActions';

export const dynamic = 'force-dynamic';

/**
 * Minimal, dedicated staff card-management page (migration 0075) —
 * deliberately its own small route rather than threading new UI into the
 * existing 1000+-line /staff/queue page, keeping this change isolated and
 * easy to review. Never selects claim_token or nfc_uid — staff can already
 * see a card's claim_token on the production queue when relevant; this
 * page's own job is lifecycle status only.
 */
type CardRow = {
  id: string;
  status: string;
  access_status: 'suspended' | 'revoked' | null;
  access_status_reason: string | null;
  access_status_changed_at: string | null;
  replaced_by_card_id: string | null;
  player_id: string | null;
  players: { name: string } | null;
};

export default async function StaffCardDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const staffCheck = await requireStaff(supabase);
  if (!staffCheck.ok) {
    redirect(`/staff/login?next=/staff/cards/${params.id}`);
  }

  const serviceRole = createServiceRoleClient();
  const { data: card } = await serviceRole
    .from('cards')
    .select('id, status, access_status, access_status_reason, access_status_changed_at, replaced_by_card_id, player_id, players ( name )')
    .eq('id', params.id)
    .maybeSingle<CardRow>();

  if (!card) {
    notFound();
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '32px 20px' }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>{card.players?.name ?? 'Unnamed player'}</h1>
      <p style={{ fontSize: 13, color: '#6B6357', marginBottom: 24 }}>Card {card.id}</p>

      <div style={{ background: '#fff', border: '1px solid #E5E1D8', borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <dl style={{ margin: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
            <dt style={{ color: '#6B6357', fontSize: 13 }}>Claim status</dt>
            <dd style={{ margin: 0, fontWeight: 700, fontSize: 13 }}>{card.status}</dd>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
            <dt style={{ color: '#6B6357', fontSize: 13 }}>Access status</dt>
            <dd style={{ margin: 0, fontWeight: 700, fontSize: 13 }}>{card.access_status ?? 'active'}</dd>
          </div>
          {card.access_status_reason && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
              <dt style={{ color: '#6B6357', fontSize: 13 }}>Reason</dt>
              <dd style={{ margin: 0, fontWeight: 700, fontSize: 13 }}>{card.access_status_reason}</dd>
            </div>
          )}
          {card.replaced_by_card_id && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
              <dt style={{ color: '#6B6357', fontSize: 13 }}>Replaced by</dt>
              <dd style={{ margin: 0, fontWeight: 700, fontSize: 13 }}>
                <a href={`/staff/cards/${card.replaced_by_card_id}`}>{card.replaced_by_card_id}</a>
              </dd>
            </div>
          )}
        </dl>
      </div>

      <CardLifecycleActions cardId={card.id} accessStatus={card.access_status} />
    </div>
  );
}
