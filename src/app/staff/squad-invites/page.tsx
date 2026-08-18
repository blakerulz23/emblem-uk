import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireSquadInvitePermission } from '@/lib/require-squad-invite-permission';
import { listSquadInviteStaffPermissions } from '@/lib/squad-invite-staff-identity';
import { isSquadInviteMvpEnabled } from '@/lib/squad-invite-mvp';
import StaffIdentityPanel from './StaffIdentityPanel';

export const dynamic='force-dynamic';
function businessDaysOld(value:string|null){if(!value)return 0;let days=0;const cursor=new Date(value);const today=new Date();cursor.setHours(0,0,0,0);today.setHours(0,0,0,0);while(cursor<today){cursor.setDate(cursor.getDate()+1);if(cursor.getDay()!==0&&cursor.getDay()!==6)days++;}return days;}

const STATUS_TABS=['new','under_review','changes_requested','resubmitted','approved_setup_required','active','rejected','all'] as const;
// Presentation only — colour is never the only signal (each badge also
// carries its own text label), matching the "status not by colour alone"
// accessibility requirement.
const STATUS_BADGE: Record<string,string>={
  submitted:'border-blue-300 bg-blue-50 text-blue-800',
  under_review:'border-amber-300 bg-amber-50 text-amber-800',
  changes_requested:'border-amber-300 bg-amber-50 text-amber-800',
  resubmitted:'border-blue-300 bg-blue-50 text-blue-800',
  approved_setup_required:'border-emerald-300 bg-emerald-50 text-emerald-800',
  active:'border-emerald-400 bg-emerald-600 text-white',
  rejected:'border-red-300 bg-red-50 text-red-800',
};
// UI-only grouping (no archive field/API exists — see the report for this
// limitation). campaign_status is already fetched for the display-status
// derivation below, so classifying a request as closed from
// request_status==='rejected' or a terminal campaign_status re-uses data
// already on the row rather than adding a new query or a deletion/mutation.
const CLOSED_CAMPAIGN_STATUSES=new Set(['closed','cancelled','expired']);

function buildHref(current:Record<string,string|undefined>,overrides:Record<string,string|undefined>){
  const merged={...current,...overrides};
  const params=new URLSearchParams();
  for(const [key,value] of Object.entries(merged)) if(value) params.set(key,value);
  const qs=params.toString();
  return `/staff/squad-invites${qs?`?${qs}`:''}`;
}

export default async function SquadInviteQueue({searchParams}:{searchParams:Record<string,string|undefined>}) {
  if(!isSquadInviteMvpEnabled()) notFound();
  // Read access accepts either permission — a reviewer-only or
  // approver-only staff member can both view the queue; only the mutation
  // endpoints (review/route.ts, approve/route.ts, etc.) require one
  // specific permission. A 401 (not signed in) legitimately sends the
  // visitor to login; a 403 (signed in, is staff, but holds neither
  // squad-invite permission) must NOT redirect to login — that page's own
  // requireStaff() check only verifies generic staff membership, which
  // this visitor already has, so it would immediately redirect back here,
  // looping forever. notFound() gives a denied-but-authenticated staff
  // member one stable destination instead.
  const access=await requireSquadInvitePermission(createClient(),['squad_invite_reviewer','squad_invite_approver']);
  if(!access.ok){
    if(access.status===401) redirect('/staff/login?next=/staff/squad-invites');
    notFound();
  }
  // Display-only — a second, separate createClient() call, same pattern
  // used elsewhere (e.g. builder/page.tsx's resolveSquadInviteContext).
  // Email comes only from the already-verified server session (never a
  // request body/URL/searchParams), and the permission list is the full
  // set, not just the OR-match the access check above confirmed. Neither
  // call widens or replaces the gate above.
  const [{data:{user}},staffPermissions]=await Promise.all([createClient().auth.getUser(),listSquadInviteStaffPermissions(access.userId)]);
  const staffEmail=user?.email??'';
  const status=searchParams.status;
  const sort=searchParams.sort==='oldest'?'oldest':'newest';
  const q=(searchParams.q??'').trim().toLowerCase();
  const {data}=await createServiceRoleClient().from('squad_invite_requests').select('public_reference,club_team_name,football_age_group,organiser_name,organiser_role,submitted_at,proposed_deadline_at,request_status,badge_review_status,delivery_recipient_name,assigned_staff_profile_id,squad_invites(campaign_status)').order('submitted_at',{ascending:sort==='oldest'});
  const rows=(data??[]).map(r=>{const campaign=Array.isArray(r.squad_invites)?r.squad_invites[0]:r.squad_invites;const displayStatus=r.request_status==='approved'?(campaign?.campaign_status==='active'?'active':'approved_setup_required'):r.request_status;const closed=r.request_status==='rejected'||CLOSED_CAMPAIGN_STATUSES.has(campaign?.campaign_status??'');return {...r,displayStatus,age:businessDaysOld(r.submitted_at),closed};});
  const statusFiltered=!status||status==='all'?rows:status==='new'?rows.filter(r=>r.displayStatus==='submitted'):rows.filter(r=>r.displayStatus===status);
  const searched=!q?statusFiltered:statusFiltered.filter(r=>[r.club_team_name,r.organiser_name,r.public_reference,r.football_age_group].some(v=>v.toLowerCase().includes(q)));
  const activeWork=searched.filter(r=>!r.closed);
  const closedWork=searched.filter(r=>r.closed);
  const counts=Object.fromEntries(['new','under_review','changes_requested','resubmitted','approved_setup_required','active','rejected'].map(k=>[k,k==='new'?rows.filter(r=>r.displayStatus==='submitted').length:rows.filter(r=>r.displayStatus===k).length]));
  const currentParams={status,sort:searchParams.sort,q:searchParams.q};

  return <div className="mx-auto max-w-5xl px-5 py-12 pb-28">
    <p className="text-sm font-bold uppercase tracking-widest text-orange-600">Internal · Staff only</p>
    <h1 className="mt-3 text-3xl font-bold">Player Queue → Squad Invites</h1>
    <nav className="mt-6 flex flex-wrap gap-2 text-sm"><Link href="/staff/queue" className="hover:underline">Player Orders</Link><strong>Squad Invites</strong><Link href="/staff/queue#profile-setup" className="hover:underline">Profile Setup</Link><Link href="/staff/deletion-requests" className="hover:underline">Data Requests</Link></nav>
    <StaffIdentityPanel email={staffEmail} permissions={staffPermissions} />

    <form method="GET" className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center" role="search" aria-label="Search Squad Invite requests">
      {status&&<input type="hidden" name="status" value={status}/>}
      {searchParams.sort&&<input type="hidden" name="sort" value={searchParams.sort}/>}
      <label htmlFor="squad-invite-search" className="sr-only">Search by team, organiser, reference or age group</label>
      <input id="squad-invite-search" name="q" type="search" defaultValue={searchParams.q??''} placeholder="Search by team, organiser, reference…" className="min-h-[44px] w-full rounded-xl border border-neutral-300 p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 sm:max-w-xs"/>
      <button type="submit" className="min-h-[44px] rounded-xl border-2 border-orange-600 px-5 font-bold text-orange-600 transition hover:bg-orange-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600">Search</button>
      {q&&<Link href={buildHref(currentParams,{q:undefined})} className="text-sm font-semibold text-neutral-600 hover:underline">Clear search</Link>}
      <div className="sm:ml-auto flex gap-2 text-sm" role="group" aria-label="Sort order">
        <Link href={buildHref(currentParams,{sort:undefined})} aria-current={sort==='newest'?'true':undefined} className={`rounded-full border px-3 py-1.5 font-semibold transition ${sort==='newest'?'border-orange-600 bg-orange-600 text-white':'border-neutral-300 text-neutral-700 hover:bg-neutral-50'}`}>Newest first</Link>
        <Link href={buildHref(currentParams,{sort:'oldest'})} aria-current={sort==='oldest'?'true':undefined} className={`rounded-full border px-3 py-1.5 font-semibold transition ${sort==='oldest'?'border-orange-600 bg-orange-600 text-white':'border-neutral-300 text-neutral-700 hover:bg-neutral-50'}`}>Oldest first</Link>
      </div>
    </form>

    <nav className="mt-6 flex flex-wrap gap-2" aria-label="Filter by status">{STATUS_TABS.map(x=>{const isActive=(status??'all')===x||(!status&&x==='all');return <Link key={x} href={buildHref(currentParams,{status:x==='all'?undefined:x})} aria-current={isActive?'page':undefined} className={`min-h-[36px] rounded-full border px-3 py-1.5 text-sm font-semibold capitalize transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 ${isActive?'border-orange-600 bg-orange-600 text-white':'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50'}`}>{x.replaceAll('_',' ')}{x!=='all'?` (${counts[x]??0})`:` (${rows.length})`}</Link>;})}</nav>

    <section className="mt-8">
      <h2 className="text-lg font-bold">Active work <span className="font-normal text-neutral-500">({activeWork.length})</span></h2>
      {activeWork.length===0&&<p className="mt-3 rounded-2xl border border-dashed p-6 text-center text-sm text-neutral-500">No requests match this filter.</p>}
      <div className="mt-3 grid gap-3">{activeWork.map(r=><QueueCard key={r.public_reference} r={r}/>)}</div>
    </section>

    {closedWork.length>0&&<details className="mt-8 rounded-2xl border bg-neutral-50">
      <summary className="cursor-pointer select-none p-4 text-lg font-bold">Completed / closed <span className="font-normal text-neutral-500">({closedWork.length})</span></summary>
      <div className="grid gap-3 p-4 pt-0">{closedWork.map(r=><QueueCard key={r.public_reference} r={r}/>)}</div>
    </details>}
  </div>;
}

type QueueRow={public_reference:string;club_team_name:string;football_age_group:string;organiser_name:string;organiser_role:string;displayStatus:string;badge_review_status:string;assigned_staff_profile_id:string|null;age:number;closed:boolean};

function QueueCard({r}:{r:QueueRow}){
  const badgeClass=STATUS_BADGE[r.displayStatus]??'border-neutral-300 bg-neutral-50 text-neutral-800';
  return <Link className="group block rounded-2xl border bg-white p-5 transition hover:border-orange-300 hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600" href={`/staff/squad-invites/${r.public_reference}`}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <strong className="text-base">{r.club_team_name} · {r.football_age_group}</strong>
      <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide ${badgeClass}`}>{r.displayStatus.replaceAll('_',' ')}</span>
    </div>
    <p className="mt-1 text-sm text-neutral-600">{r.public_reference} · {r.organiser_name} · {r.organiser_role.replaceAll('_',' ')}</p>
    <p className="mt-1 text-sm text-neutral-600">Badge: {r.badge_review_status.replaceAll('_',' ')}</p>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm">
        <span className={r.assigned_staff_profile_id?'text-neutral-600':'font-semibold text-amber-700'}>{r.assigned_staff_profile_id?'Assigned reviewer':'Unassigned'}</span>
        {' · '}
        <span className={r.age>2?'font-semibold text-red-700':'text-neutral-600'}>{r.age>2?`Overdue (${r.age} UK business days)`:`Age ${r.age} UK business day(s)`}</span>
      </p>
      <span className="text-sm font-bold text-orange-600 group-hover:underline">Open request →</span>
    </div>
  </Link>;
}
