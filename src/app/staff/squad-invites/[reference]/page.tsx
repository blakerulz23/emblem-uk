import { notFound, redirect } from 'next/navigation';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireSquadInvitePermission } from '@/lib/require-squad-invite-permission';
import { listSquadInviteStaffPermissions } from '@/lib/squad-invite-staff-identity';
import { isSquadInviteMvpEnabled } from '@/lib/squad-invite-mvp';
import StaffIdentityPanel from '../StaffIdentityPanel';
import ReviewActions from './ReviewActions';
import FinalisePricingButton from './FinalisePricingButton';

export default async function ReviewSquadInvite({params}:{params:{reference:string}}){
  if(!isSquadInviteMvpEnabled()) notFound();
  // Same reviewer-OR-approver read access, and same 401-vs-403 split, as
  // the queue page — see its comment for why a 403 must render notFound()
  // rather than redirect to login (that would loop: /staff/login's own
  // requireStaff() check only verifies generic staff membership, which a
  // signed-in staff member lacking squad-invite permission already
  // satisfies, so it would bounce them straight back here).
  const access=await requireSquadInvitePermission(createClient(),['squad_invite_reviewer','squad_invite_approver']);
  if(!access.ok){
    if(access.status===401) redirect(`/staff/login?next=/staff/squad-invites/${encodeURIComponent(params.reference)}`);
    notFound();
  }
  // Display-only — same reasoning as the queue page's identical fetch: the
  // access gate above is unchanged, this only adds what to show, not who
  // may see it. Email is read straight off the verified session.
  const [{data:{user}},staffPermissions]=await Promise.all([createClient().auth.getUser(),listSquadInviteStaffPermissions(access.userId)]);
  const staffEmail=user?.email??'';
  const service=createServiceRoleClient();
  const {data:r}=await service.from('squad_invite_requests').select('id,public_reference,club_team_name,football_age_group,expected_squad_size,organiser_name,organiser_role,organiser_email_verified_at,proposed_deadline_at,delivery_recipient_name,delivery_recipient_role,uk_delivery_confirmed,badge_reference,badge_review_status,request_status,submission_revision,organiser_visible_reason,restricted_staff_note,submitted_at,campaign_id').eq('public_reference',params.reference).maybeSingle();
  if(!r) notFound();
  const [{data:outbox},{data:declarations},{data:audit},{count:duplicates},{data:participations}]=await Promise.all([service.from('squad_invite_notification_outbox').select('id,status,template_key,attempt_count').eq('request_id',r.id).order('created_at',{ascending:false}).limit(5),service.from('squad_invite_request_declarations').select('purpose,policy_version,accepted_at,submission_revision').eq('request_id',r.id).eq('submission_revision',r.submission_revision),service.from('squad_invite_request_audit_events').select('event_type,actor_role,created_at,metadata').eq('request_id',r.id).order('created_at',{ascending:true}),service.from('squad_invite_requests').select('id',{count:'exact',head:true}).eq('club_team_name',r.club_team_name).neq('id',r.id).in('request_status',['submitted','under_review','resubmitted','approved']),r.campaign_id?service.from('squad_invite_participations').select('payment_request_status,payment_deadline_at,print_quantity').eq('campaign_id',r.campaign_id).order('created_at',{ascending:true}):Promise.resolve({data:null})]);
  // Payment status only — never a child field. "Staff decides manually"
  // (see the payment-flow scoping notes): nothing here auto-cancels or
  // auto-extends an overdue payment request, this section only makes one
  // visible so a human can choose what to do about it.
  const now=new Date();
  const paymentRows=participations??[];
  const overdueCount=paymentRows.filter(p=>p.payment_request_status==='issued'&&p.payment_deadline_at&&new Date(p.payment_deadline_at)<now).length;
  const paidCount=paymentRows.filter(p=>p.payment_request_status==='paid').length;
  return <main className="mx-auto max-w-3xl px-5 py-12"><p className="text-sm font-bold uppercase tracking-widest text-orange-600">Review Squad Invite</p><h1 className="mt-3 text-3xl font-bold">{r.club_team_name}</h1><StaffIdentityPanel email={staffEmail} permissions={staffPermissions} /><dl className="mt-6 grid gap-3 rounded-2xl border bg-white p-6"><div><dt>Request</dt><dd>{r.public_reference}</dd></div><div><dt>Age group / estimate</dt><dd>{r.football_age_group} · {r.expected_squad_size??'Not supplied'}</dd></div><div><dt>Organiser</dt><dd>{r.organiser_name} · {r.organiser_role.replaceAll('_',' ')}</dd></div><div><dt>Email control</dt><dd>{r.organiser_email_verified_at?'Verified':'Not verified'} — declared team role reviewed separately</dd></div><div><dt>Delivery recipient</dt><dd>{r.delivery_recipient_name}, {r.delivery_recipient_role}; UK delivery {r.uk_delivery_confirmed?'confirmed':'missing'}. Full address deferred.</dd></div><div><dt>Badge</dt><dd>{r.badge_review_status.replaceAll('_',' ')}; approval is not proof of trademark ownership.</dd></div><div><dt>Duplicate signal</dt><dd>{duplicates??0} other open request(s) with the same display name</dd></div><div><dt>Status</dt><dd>{r.request_status.replaceAll('_',' ')}</dd></div><div><dt>Declarations</dt><dd>{(declarations??[]).map(x=>`${x.purpose} (${x.policy_version})`).join(', ')}</dd></div><div><dt>Restricted note</dt><dd>{r.restricted_staff_note||'None'}</dd></div></dl><ReviewActions requestId={r.id} status={r.request_status} outboxId={outbox?.[0]?.id} staffEmail={staffEmail} staffPermissions={staffPermissions}/><section className="mt-6 rounded-2xl border p-5"><h2 className="font-bold">Audit history</h2>{(audit??[]).map((x,i)=><div key={`${x.created_at}-${i}`}><p className={x.event_type==='organiser_flagged_concern'?'font-bold text-red-700':undefined}>{x.event_type.replaceAll('_',' ')} · {x.actor_role}</p>{x.event_type==='organiser_flagged_concern'&&<p className="text-sm">{String((x.metadata as {note?:unknown})?.note??'')}</p>}</div>)}</section><section className="mt-6 rounded-2xl border p-5"><h2 className="font-bold">Notification outbox</h2>{(outbox??[]).map(x=><p key={x.id}>{x.template_key}: {x.status} · attempts {x.attempt_count}</p>)}</section>{r.campaign_id&&<section className="mt-6 rounded-2xl border p-5"><h2 className="font-bold">Payment status</h2><p className="text-sm">{paidCount} paid · {overdueCount} overdue · {paymentRows.length} total participants</p>{overdueCount>0&&<p className="mt-2 font-bold text-red-700">{overdueCount} participant{overdueCount===1?'':'s'} past the 72-hour payment window. Nothing happens automatically — decide whether to chase, extend or cancel each one.</p>}<ul className="mt-3 grid gap-1 text-sm">{paymentRows.map((p,i)=>{const overdue=p.payment_request_status==='issued'&&p.payment_deadline_at&&new Date(p.payment_deadline_at)<now;return <li key={i} className={overdue?'font-bold text-red-700':undefined}>Participant {i+1} · {p.print_quantity} cop{p.print_quantity===1?'y':'ies'} · {p.payment_request_status.replaceAll('_',' ')}{p.payment_deadline_at?` · due ${new Date(p.payment_deadline_at).toLocaleString('en-GB')}`:''}{overdue?' (overdue)':''}</li>;})}</ul><FinalisePricingButton campaignId={r.campaign_id}/></section>}<p className="mt-5 text-sm">Reviewer and approver actions require separate server permissions. No child roster exists.</p></main>;
}
