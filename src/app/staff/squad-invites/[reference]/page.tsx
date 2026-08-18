import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireSquadInvitePermission } from '@/lib/require-squad-invite-permission';
import { listSquadInviteStaffPermissions } from '@/lib/squad-invite-staff-identity';
import { isSquadInviteMvpEnabled } from '@/lib/squad-invite-mvp';
import StaffIdentityPanel from '../StaffIdentityPanel';
import ReviewActions from './ReviewActions';
import FinalisePricingButton from './FinalisePricingButton';

// Staff-facing labels for the stored declaration `purpose` values (see
// submit_squad_invite_request in 0054_squad_invite_concurrent_submission_idempotency.sql).
// No such dictionary existed before this — the organiser form's own
// declarationLabels (OrganiserStart.tsx) and the builder's parent-facing
// SQUAD_INVITE_REQUIRED_DECLARATIONS use two other, unrelated key schemes,
// so this one is scoped to exactly the keys this page reads.
const DECLARATION_PURPOSE_LABEL: Record<string, string> = {
  organiser_authority: 'Authorised to create this Squad Invite',
  delivery_recipient_agreement: 'Delivery recipient has agreed',
  independent_participation: 'Independent parent participation understood',
  staff_review_required: 'Staff approval requirement understood',
  badge_authority: 'Badge/crest usage authority declared',
};

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
  const [{data:outbox},{data:declarations},{data:audit},{count:duplicates},{data:participations},{data:campaign}]=await Promise.all([service.from('squad_invite_notification_outbox').select('id,status,template_key,attempt_count').eq('request_id',r.id).order('created_at',{ascending:false}).limit(5),service.from('squad_invite_request_declarations').select('purpose,policy_version,accepted_at,submission_revision').eq('request_id',r.id).eq('submission_revision',r.submission_revision),service.from('squad_invite_request_audit_events').select('event_type,actor_role,created_at,metadata').eq('request_id',r.id).order('created_at',{ascending:true}),service.from('squad_invite_requests').select('id',{count:'exact',head:true}).eq('club_team_name',r.club_team_name).neq('id',r.id).in('request_status',['submitted','under_review','resubmitted','approved']),r.campaign_id?service.from('squad_invite_participations').select('payment_request_status,payment_deadline_at,print_quantity,status,commitment_completed_at').eq('campaign_id',r.campaign_id).order('created_at',{ascending:true}):Promise.resolve({data:null}),r.campaign_id?service.from('squad_invites').select('delivery_address,delivery_postcode,delivery_contact,delivery_instructions,deadline_at,grace_ends_at,pricing_finalised_at,campaign_status,final_tier,final_unit_price_pence').eq('id',r.campaign_id).maybeSingle():Promise.resolve({data:null})]);
  // Payment status only — never a child field. "Staff decides manually"
  // (see the payment-flow scoping notes): nothing here auto-cancels or
  // auto-extends an overdue payment request, this section only makes one
  // visible so a human can choose what to do about it.
  const now=new Date();
  const paymentRows=participations??[];
  const overdueCount=paymentRows.filter(p=>p.payment_request_status==='issued'&&p.payment_deadline_at&&new Date(p.payment_deadline_at)<now).length;
  const paidCount=paymentRows.filter(p=>p.payment_request_status==='paid').length;
  const eligibleCommitments=paymentRows.filter(p=>p.status==='commitment_completed').length;
  const totalPrintQuantity=paymentRows.reduce((sum,p)=>sum+(p.print_quantity??0),0);

  return <div className="mx-auto max-w-3xl px-5 py-12 pb-28">
    <Link href="/staff/squad-invites" className="text-sm font-bold text-orange-600 hover:text-orange-700">← Back to Squad Invite queue</Link>
    <p className="mt-4 text-sm font-bold uppercase tracking-widest text-orange-600">Review Squad Invite</p>
    <h1 className="mt-1 text-3xl font-bold">{r.club_team_name}</h1>
    <StaffIdentityPanel email={staffEmail} permissions={staffPermissions} />

    <section aria-labelledby="squad-invite-summary-heading" className="mt-6 rounded-2xl border bg-white p-6">
      <h2 id="squad-invite-summary-heading" className="text-lg font-bold">Request summary</h2>
      <dl className="mt-3 grid gap-3">
        <div><dt className="text-sm font-semibold text-neutral-500">Request</dt><dd>{r.public_reference}</dd></div>
        <div><dt className="text-sm font-semibold text-neutral-500">Age group / estimate</dt><dd>{r.football_age_group} · {r.expected_squad_size??'Not supplied'}</dd></div>
        <div><dt className="text-sm font-semibold text-neutral-500">Status</dt><dd><span className="inline-block rounded-full border border-neutral-300 bg-neutral-50 px-3 py-1 text-xs font-bold uppercase tracking-wide">{r.request_status.replaceAll('_',' ')}</span></dd></div>
        <div><dt className="text-sm font-semibold text-neutral-500">Duplicate signal</dt><dd>{duplicates??0} other open request(s) with the same display name</dd></div>
        {r.restricted_staff_note&&<div><dt className="text-sm font-semibold text-neutral-500">Restricted staff note</dt><dd className="rounded-lg bg-amber-50 p-2">{r.restricted_staff_note}</dd></div>}
      </dl>
    </section>

    <section aria-labelledby="squad-invite-organiser-heading" className="mt-6 rounded-2xl border bg-white p-6">
      <h2 id="squad-invite-organiser-heading" className="text-lg font-bold">Organiser and delivery details</h2>
      <dl className="mt-3 grid gap-3">
        <div><dt className="text-sm font-semibold text-neutral-500">Organiser</dt><dd>{r.organiser_name} · {r.organiser_role.replaceAll('_',' ')}</dd></div>
        <div><dt className="text-sm font-semibold text-neutral-500">Email control</dt><dd>{r.organiser_email_verified_at?'Verified':'Not verified'} — declared team role reviewed separately</dd></div>
        <div><dt className="text-sm font-semibold text-neutral-500">Delivery recipient</dt><dd>{r.delivery_recipient_name}, {r.delivery_recipient_role}; UK delivery {r.uk_delivery_confirmed?'confirmed':'missing'}. {campaign?.delivery_address?<>Ship to: {campaign.delivery_address}, {campaign.delivery_postcode} · {campaign.delivery_contact}{campaign.delivery_instructions?` · ${campaign.delivery_instructions}`:''}</>:'Full address not yet provided — organiser has not completed delivery setup.'}</dd></div>
        <div><dt className="text-sm font-semibold text-neutral-500">Badge</dt><dd>{r.badge_review_status.replaceAll('_',' ')}; approval is not proof of trademark ownership.</dd></div>
        <div>
          <dt className="text-sm font-semibold text-neutral-500">Declarations</dt>
          <dd><ul className="mt-1 grid gap-1 text-sm">{(declarations??[]).map(x=><li key={x.purpose} className="flex gap-2"><span aria-hidden className="font-bold text-emerald-700">✓</span><span>{DECLARATION_PURPOSE_LABEL[x.purpose]??x.purpose.replaceAll('_',' ')}</span></li>)}</ul></dd>
        </div>
      </dl>
    </section>

    <section aria-labelledby="squad-invite-review-heading">
      <h2 id="squad-invite-review-heading" className="sr-only">Review decision</h2>
      <ReviewActions requestId={r.id} status={r.request_status} outboxId={outbox?.[0]?.id} staffEmail={staffEmail} staffPermissions={staffPermissions}/>
    </section>

    {r.campaign_id&&<section aria-labelledby="squad-invite-pricing-heading" className="mt-6 rounded-2xl border p-5">
      <h2 id="squad-invite-pricing-heading" className="text-lg font-bold">Pricing and campaign progress</h2>
      <p className="mt-2 text-sm">{paidCount} paid · {overdueCount} overdue · {paymentRows.length} total participants</p>
      {overdueCount>0&&<p className="mt-2 font-bold text-red-700">{overdueCount} participant{overdueCount===1?'':'s'} past the 72-hour payment window. Nothing happens automatically — decide whether to chase, extend or cancel each one.</p>}
      <ul className="mt-3 grid gap-1 text-sm">{paymentRows.map((p,i)=>{const overdue=p.payment_request_status==='issued'&&p.payment_deadline_at&&new Date(p.payment_deadline_at)<now;return <li key={i} className={overdue?'font-bold text-red-700':undefined}>Participant {i+1} · {p.print_quantity} cop{p.print_quantity===1?'y':'ies'} · {p.payment_request_status.replaceAll('_',' ')}{p.payment_deadline_at?` · due ${new Date(p.payment_deadline_at).toLocaleString('en-GB')}`:''}{overdue?' (overdue)':''}</li>;})}</ul>
      <FinalisePricingButton
        campaignId={r.campaign_id}
        totalParticipants={paymentRows.length}
        eligibleCommitments={eligibleCommitments}
        totalPrintQuantity={totalPrintQuantity}
        paidCount={paidCount}
        deadlineAt={campaign?.deadline_at??null}
        graceEndsAt={campaign?.grace_ends_at??null}
        campaignStatus={campaign?.campaign_status??null}
        alreadyFinalised={Boolean(campaign?.pricing_finalised_at)}
        finalTier={campaign?.final_tier??null}
        finalUnitPricePence={campaign?.final_unit_price_pence??null}
      />
    </section>}

    <details className="mt-6 rounded-2xl border bg-neutral-50">
      <summary className="cursor-pointer select-none p-4 text-lg font-bold">Technical details</summary>
      <div className="grid gap-6 p-4 pt-0">
        <section aria-labelledby="squad-invite-audit-heading">
          <h3 id="squad-invite-audit-heading" className="font-bold">Audit history</h3>
          <div className="mt-2 grid gap-2 text-sm">{(audit??[]).map((x,i)=><div key={`${x.created_at}-${i}`}><p className={x.event_type==='organiser_flagged_concern'?'font-bold text-red-700':undefined}>{x.event_type.replaceAll('_',' ')} · {x.actor_role} · {new Date(x.created_at).toLocaleString('en-GB')}</p>{x.event_type==='organiser_flagged_concern'&&<p className="text-sm">{String((x.metadata as {note?:unknown})?.note??'')}</p>}</div>)}</div>
        </section>
        <section aria-labelledby="squad-invite-outbox-heading">
          <h3 id="squad-invite-outbox-heading" className="font-bold">Notification outbox</h3>
          <div className="mt-2 grid gap-1 text-sm">{(outbox??[]).map(x=><p key={x.id}>{x.template_key}: {x.status} · attempts {x.attempt_count}</p>)}</div>
        </section>
      </div>
    </details>
    <p className="mt-5 text-sm text-neutral-600">No child roster exists.</p>
  </div>;
}
