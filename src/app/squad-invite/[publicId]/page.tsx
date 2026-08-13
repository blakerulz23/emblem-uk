import { notFound } from 'next/navigation';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { effectiveCampaignStatus } from '@/lib/squad-invite';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Squad Invite | Emblem', robots: { index: false, follow: false } };

export default async function SquadInvitePage({ params }: { params: { publicId: string } }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.publicId)) notFound();
  const service = createServiceRoleClient();
  const { data } = await service.from('squad_invites')
    .select('id,club_team_name,football_age_group,deadline_at,campaign_status,final_tier,final_unit_price_pence,coach_card_eligible,delivery_recipient_name,delivery_recipient_role')
    .eq('public_id', params.publicId).maybeSingle();
  if (!data) notFound();
  const status = effectiveCampaignStatus(data.campaign_status, data.deadline_at);
  if (!['active','grace_period','deadline_reached','pricing_finalised'].includes(status)) notFound();
  const { count } = await service.from('squad_invite_participations').select('id', { head: true, count: 'exact' })
    .eq('campaign_id', data.id).eq('status', 'commitment_completed');
  const startsOpen = status === 'active';
  const price = data.final_unit_price_pence ? `£${(data.final_unit_price_pence / 100).toFixed(2)}` : 'Final price set when the invite closes';

  return <main style={{ minHeight: '100vh', background: '#f5f0e8', color: '#17251d', padding: '32px 18px' }}>
    <section style={{ maxWidth: 680, margin: '0 auto', background: '#fff', borderRadius: 24, padding: 28, boxShadow: '0 18px 60px rgba(23,37,29,.12)' }}>
      <p style={{ letterSpacing: 2, textTransform: 'uppercase', fontWeight: 800, color: '#36754a' }}>Emblem Squad Invite</p>
      <h1 style={{ fontSize: 'clamp(2rem,8vw,3.6rem)', margin: '8px 0' }}>{data.club_team_name}</h1>
      <p>{data.football_age_group} · Invitation deadline {new Date(data.deadline_at).toLocaleString('en-GB', { timeZone: 'Europe/London' })}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, margin: '24px 0' }}>
        <div style={{ background: '#eef6ee', padding: 16, borderRadius: 16 }}><strong>{count ?? 0}</strong><br />completed commitments</div>
        <div style={{ background: '#eef6ee', padding: 16, borderRadius: 16 }}><strong>{price}</strong><br />per card before extra prints</div>
        <div style={{ background: '#eef6ee', padding: 16, borderRadius: 16 }}><strong>{data.final_tier === 'squad' ? 'Unlocked' : 'Not yet final'}</strong><br />Squad price</div>
        <div style={{ background: '#eef6ee', padding: 16, borderRadius: 16 }}><strong>{data.coach_card_eligible ? 'Confirmed' : 'Locked'}</strong><br />Free coach card</div>
      </div>
      <h2>One team link. Each parent builds and pays individually.</h2>
      <p>Your child’s information is submitted privately to Emblem and is not shown to other parents. Participation is optional. No participant list or child photograph appears here.</p>
      <p><strong>Team delivery:</strong> Cards will be delivered together to {data.delivery_recipient_name || data.delivery_recipient_role} for distribution to participating families. It will not be delivered directly to your home.</p>
      <p>Complete your child’s card to join the team order. You will not be charged now. When the invitation closes, we will confirm the final group price and send you an individual payment request. Your card will enter production only after payment.</p>
      <aside style={{ background: '#fff7df', borderRadius: 16, padding: 16, margin: '20px 0' }}>
        <strong>Photo safety</strong>
        <p>Upload only a photograph you are authorised to use. Avoid school badges, house numbers, location details, unrelated children and changing-room photographs. Use an appropriate sportswear photograph.</p>
      </aside>
      {startsOpen
        ? <a href={`/builder?squadInvite=${encodeURIComponent(params.publicId)}`} style={{ display: 'block', textAlign: 'center', background: '#173f2a', color: '#fff', padding: 16, borderRadius: 999, fontWeight: 800 }}>Create your child’s card</a>
        : <p role="status" style={{ textAlign: 'center', fontWeight: 800 }}>New builders are closed. A parent who started before the deadline may have a limited completion grace period.</p>}
      <p style={{ fontSize: 13, marginTop: 20 }}>Support or photograph concern? Contact Emblem through the support details in the privacy notice. Specialist review of safeguarding escalation remains outstanding.</p>
    </section>
  </main>;
}
