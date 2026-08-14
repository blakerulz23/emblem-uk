import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireSquadInvitePermission } from '@/lib/require-squad-invite-permission';
import { isSquadInviteMvpEnabled } from '@/lib/squad-invite-mvp';

export const dynamic='force-dynamic';
function businessDaysOld(value:string|null){if(!value)return 0;let days=0;const cursor=new Date(value);const today=new Date();cursor.setHours(0,0,0,0);today.setHours(0,0,0,0);while(cursor<today){cursor.setDate(cursor.getDate()+1);if(cursor.getDay()!==0&&cursor.getDay()!==6)days++;}return days;}
export default async function SquadInviteQueue({searchParams}:{searchParams:Record<string,string|undefined>}) {
  if(!isSquadInviteMvpEnabled()) notFound();
  const access=await requireSquadInvitePermission(createClient(),'squad_invite_reviewer');
  if(!access.ok) redirect('/staff/login?next=/staff/squad-invites');
  const status=searchParams.status;
  const {data}=await createServiceRoleClient().from('squad_invite_requests').select('public_reference,club_team_name,football_age_group,organiser_name,organiser_role,submitted_at,proposed_deadline_at,request_status,badge_review_status,delivery_recipient_name,assigned_staff_profile_id,squad_invites(campaign_status)').order('submitted_at',{ascending:true});
  const rows=(data??[]).map(r=>{const campaign=Array.isArray(r.squad_invites)?r.squad_invites[0]:r.squad_invites;const displayStatus=r.request_status==='approved'?(campaign?.campaign_status==='active'?'active':'approved_setup_required'):r.request_status;return {...r,displayStatus,age:businessDaysOld(r.submitted_at)};});
  const filtered=!status||status==='all'?rows:status==='new'?rows.filter(r=>r.displayStatus==='submitted'):rows.filter(r=>r.displayStatus===status);
  const counts=Object.fromEntries(['new','under_review','changes_requested','resubmitted','approved_setup_required','active','rejected'].map(k=>[k,k==='new'?rows.filter(r=>r.displayStatus==='submitted').length:rows.filter(r=>r.displayStatus===k).length]));
  return <main className="mx-auto max-w-5xl px-5 py-12"><p className="text-sm font-bold uppercase tracking-widest text-orange-600">Internal · Staff only</p><h1 className="mt-3 text-3xl font-bold">Player Queue → Squad Invites</h1>
    <nav className="mt-6 flex flex-wrap gap-2"><Link href="/staff/queue">Player Orders</Link><strong>Squad Invites</strong><Link href="/staff/queue#profile-setup">Profile Setup</Link><Link href="/staff/deletion-requests">Data Requests</Link></nav>
    <nav className="mt-6 flex flex-wrap gap-3">{['new','under_review','changes_requested','resubmitted','approved_setup_required','active','rejected','all'].map(x=><Link key={x} href={`/staff/squad-invites?status=${x}`}>{x.replaceAll('_',' ')}{x!=='all'?` (${counts[x]??0})`:''}</Link>)}</nav>
    <div className="mt-6 grid gap-3">{filtered.map(r=><Link className="rounded-2xl border bg-white p-5" key={r.public_reference} href={`/staff/squad-invites/${r.public_reference}`}><strong>{r.club_team_name} · {r.football_age_group}</strong><p>{r.public_reference} · {r.organiser_name} · {r.organiser_role.replaceAll('_',' ')}</p><p>Status: {r.displayStatus.replaceAll('_',' ')} · Badge: {r.badge_review_status.replaceAll('_',' ')}</p><p>{r.assigned_staff_profile_id?'Assigned reviewer':'Unassigned'} · {r.age>2?`Overdue (${r.age} UK business days)`:`Age ${r.age} UK business day(s)`}</p></Link>)}</div>
  </main>;
}
