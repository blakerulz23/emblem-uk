'use client';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { DELIVERY_RECIPIENT_ROLES, FOOTBALL_AGE_GROUPS, formatDeadline, initialOrganiserForm, ORGANISER_DECLARATIONS, OrganiserForm, projectedSquadIncentive, validateOrganiserForm } from '@/lib/squad-invite-organiser-form';

type Stage='email'|'otp'|'existing'|'details'|'review'|'receipt';
type ExistingRequest={publicReference:string;teamName:string;status:string};
const roleLabels: Record<string,string>={coach_or_club_representative:'Coach or authorised club representative',team_manager:'Team manager',parent_representative:'Parent representative authorised by the team'};
const declarationLabels: Record<(typeof ORGANISER_DECLARATIONS)[number],string>={authorityAccepted:'I confirm that I am an adult authorised to create and share this Squad Invite for the named team.',deliveryRecipientAccepted:'I confirm that the delivery recipient has agreed to receive and distribute the completed team package.',independentParticipationAccepted:'I understand that each parent decides independently whether to participate.',staffReviewAccepted:'I understand that Emblem staff must approve this request before it can be shared.'};

// initialExistingRequests is undefined for a visitor with no verified
// Supabase Auth session (start at 'email', exactly as before) — genuinely
// different from an empty array, which means the session IS already
// verified but this organiser has zero requests yet, so there is nothing
// to re-verify: skip straight to 'details'. A non-empty array is the true
// one-click "Back to your Squad Invites" case.
//
// initialSignedInEmail is shown throughout details/review/existing so a
// mismatch between the email an organiser typed and the email their
// browser tab actually has a live session for (real, confirmed multi-tab
// bug — Supabase Auth session cookies are shared across tabs, so a stale
// tab can submit under an old session) is visible before submission
// rather than discovered afterwards via a support request.
export default function OrganiserStart({initialExistingRequests,initialSignedInEmail}:{initialExistingRequests?:ExistingRequest[];initialSignedInEmail?:string}={}){
 const [stage,setStage]=useState<Stage>(initialExistingRequests===undefined?'email':initialExistingRequests.length>0?'existing':'details');
 const [csrf,setCsrf]=useState(''); const [email,setEmail]=useState(''); const [code,setCode]=useState(''); const [error,setError]=useState(''); const [fieldErrors,setFieldErrors]=useState<ReturnType<typeof validateOrganiserForm>>([]); const [cooldown,setCooldown]=useState(0); const [form,setForm]=useState<OrganiserForm>(initialOrganiserForm); const [receipt,setReceipt]=useState<{publicReference:string;created:boolean}|null>(null); const [submitting,setSubmitting]=useState(false); const submissionKey=useRef<string>(); const [existingRequests,setExistingRequests]=useState<ExistingRequest[]>(initialExistingRequests??[]); const [signedInEmail,setSignedInEmail]=useState<string|undefined>(initialSignedInEmail);
 // Free-text fields with a curated dropdown layered on top (see
 // squad-invite-organiser-form.ts's FOOTBALL_AGE_GROUPS/DELIVERY_RECIPIENT_ROLES
 // comment) — these two flags track "the organiser picked Other" as UI
 // state independent of the field's current value, specifically so
 // clearing the value to let them type doesn't make the dropdown snap back
 // to its placeholder. They default to false and only ever become true via
 // an explicit selection, so a returning organiser editing a previously
 // "Other" value never has to re-discover this control.
 const [ageGroupOther,setAgeGroupOther]=useState(false);
 const [deliveryRoleOther,setDeliveryRoleOther]=useState(false);
 useEffect(()=>{void fetch('/api/squad-invite-organiser-auth/context',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject()).then(x=>setCsrf(x.csrfToken)).catch(()=>setError('This controlled-pilot request is unavailable.'));},[]);
 useEffect(()=>{if(!cooldown)return;const id=setInterval(()=>setCooldown(x=>Math.max(0,x-1)),1000);return()=>clearInterval(id);},[cooldown]);
 const send=async()=>{setError('');const r=await fetch('/api/squad-invite-organiser-auth/request-code',{method:'POST',headers:{'Content-Type':'application/json','X-Emblem-CSRF':csrf},body:JSON.stringify({email})});if(!r.ok&&r.status!==429){setError('We could not process that request. Please try again.');return;}setCooldown(60);setStage('otp');};
 const verify=async()=>{setError('');const r=await fetch('/api/squad-invite-organiser-auth/verify-code',{method:'POST',headers:{'Content-Type':'application/json','X-Emblem-CSRF':csrf},body:JSON.stringify({email,code,returnTo:'/squad-invite/start'})});if(!r.ok){setError('That verification code was not accepted.');return;}setSignedInEmail(email);const b=await r.json().catch(()=>null) as {existingRequests?:ExistingRequest[]}|null;const existing=b?.existingRequests??[];if(existing.length>0){setExistingRequests(existing);setStage('existing');return;}setStage('details');};
 const review=(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();const errors=validateOrganiserForm(form);setFieldErrors(errors);if(errors.length){setError('Check the highlighted fields before reviewing your request.');requestAnimationFrame(()=>document.getElementById(`organiser-${errors[0].field}`)?.focus());return;}setError('');setStage('review');};
 const submit=async()=>{if(submitting)return;setSubmitting(true);setError('');submissionKey.current??=crypto.randomUUID();try{const r=await fetch('/api/squad-invite-requests',{method:'POST',headers:{'Content-Type':'application/json','X-Emblem-CSRF':csrf},body:JSON.stringify({...form,expectedSquadSize:Number(form.expectedSquadSize),deadlineAt:`${form.deadlineAt}T12:00:00.000Z`,submissionKey:submissionKey.current})});const b=await r.json().catch(()=>null);if(!r.ok){setError(b?.error??'The request could not be submitted.');return;}setReceipt(b);setStage('receipt');}finally{setSubmitting(false);}};
 const field=(key:keyof OrganiserForm,value:string|boolean)=>{setForm(x=>({...x,[key]:value}));setFieldErrors(x=>x.filter(item=>item.field!==key));};
 const message=(key:keyof OrganiserForm)=>fieldErrors.find(item=>item.field===key)?.message;
 const incentiveProjection=projectedSquadIncentive(form.expectedSquadSize);
 const squadSizeNum=Number(form.expectedSquadSize);

 return <div className="mx-auto min-h-screen max-w-2xl px-5 py-12 pb-28">
 <p className="text-sm font-bold uppercase tracking-widest text-orange-600">Controlled pilot · payment disabled</p>
 <h1 className="mt-3 text-4xl font-bold text-balance">Start your Squad Invite</h1>
 <p className="mt-4 text-neutral-700">One team link lets each parent privately create their child&apos;s card. No child information or roster is requested from the organiser.</p>
 {signedInEmail&&(stage==='existing'||stage==='details'||stage==='review')&&<p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm">Signed in as: <strong>{signedInEmail}</strong></p>}
 {stage==='email'&&<section className="mt-8 rounded-2xl border bg-white p-6"><label htmlFor="organiser-email" className="block font-semibold">Organiser email<input id="organiser-email" className="mt-2 block w-full rounded-xl border border-neutral-300 p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600" type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email"/></label><p className="mt-3 text-sm text-neutral-600">Email verification confirms that you control this email address. Your declared team role is reviewed separately by Emblem.</p><button type="button" className="mt-5 w-full min-h-[48px] rounded-xl bg-orange-600 p-3 font-bold text-white transition hover:bg-orange-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:opacity-60" disabled={!csrf||!email.includes('@')} onClick={send}>Send verification code</button></section>}
 {stage==='otp'&&<section className="mt-8 rounded-2xl border bg-white p-6"><label htmlFor="organiser-otp" className="block font-semibold">Verification code<input id="organiser-otp" className="mt-2 block w-full rounded-xl border border-neutral-300 p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600" inputMode="numeric" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,8))}/></label><button type="button" className="mt-5 w-full min-h-[48px] rounded-xl bg-orange-600 p-3 font-bold text-white transition hover:bg-orange-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:opacity-60" disabled={!/^\d{6,8}$/.test(code)} onClick={verify}>Verify email</button><div className="mt-4 flex gap-4 text-sm"><button type="button" className="min-h-[36px] inline-flex items-center font-semibold text-orange-700 underline-offset-2 hover:underline disabled:text-neutral-400" disabled={cooldown>0} onClick={send}>{cooldown?`Resend in ${cooldown}s`:'Resend code'}</button><button type="button" className="min-h-[36px] inline-flex items-center font-semibold text-neutral-600 underline-offset-2 hover:underline" onClick={()=>{setStage('email');setCode('');}}>Change email</button></div><p className="mt-3 text-sm text-neutral-600">Verification proves email control only. It does not verify club authority, employment, DBS status or safeguarding clearance.</p></section>}
 {stage==='existing'&&<section className="mt-8 rounded-2xl border bg-white p-6"><h2 className="text-2xl font-bold">Your existing Squad Invite{existingRequests.length>1?'s':''}</h2><p className="mt-3 text-neutral-700">You already have {existingRequests.length===1?'a request':`${existingRequests.length} requests`} under this email.</p><ul className="mt-4 grid gap-3">{existingRequests.map(r=><li key={r.publicReference} className="rounded-xl border p-4"><strong>{r.teamName}</strong><p className="mt-1 text-sm text-neutral-600">Reference {r.publicReference}</p><span className="mt-2 inline-block rounded-full border border-neutral-300 bg-neutral-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-neutral-700">{r.status.replaceAll('_',' ')}</span><a className="mt-3 block font-bold text-orange-600 hover:text-orange-700" href={`/squad-invite/manage/${r.publicReference}`}>View request status</a></li>)}</ul><button type="button" className="mt-5 w-full min-h-[48px] rounded-xl border-2 border-orange-600 p-3 font-bold text-orange-600 transition hover:bg-orange-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600" onClick={()=>setStage('details')}>Start a new Squad Invite for a different team</button></section>}
 {stage==='details'&&<form className="mt-8 grid gap-6 rounded-2xl border bg-white p-6" onSubmit={review} noValidate>
   <h2 className="text-2xl font-bold">Organiser and team details</h2>
   {error&&<ErrorSummary error={error} errors={fieldErrors}/>}
   <fieldset className="grid gap-4">
     <legend className="text-xs font-bold uppercase tracking-wide text-neutral-500">Organiser</legend>
     <Text id="organiser-organiserName" label="Organiser full name" autoComplete="name" value={form.organiserName} set={v=>field('organiserName',v)} error={message('organiserName')}/>
     <label htmlFor="organiser-organiserRole" className="block"><span className="font-semibold">Declared role</span><select id="organiser-organiserRole" className={`mt-1 block w-full rounded-xl border p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 ${message('organiserRole')?'border-red-500':'border-neutral-300'}`} value={form.organiserRole} onChange={e=>field('organiserRole',e.target.value)} aria-invalid={Boolean(message('organiserRole'))}><option value="coach_or_club_representative">Coach or authorised club representative</option><option value="team_manager">Team manager</option><option value="parent_representative">Parent representative authorised by the team</option></select></label>
   </fieldset>
   <fieldset className="grid gap-4 border-t pt-6">
     <legend className="text-xs font-bold uppercase tracking-wide text-neutral-500">Team</legend>
     <Text id="organiser-teamName" label="Team/club display name" value={form.teamName} set={v=>field('teamName',v)} error={message('teamName')}/>
     <label htmlFor="organiser-ageGroup" className="block">
       <span className="font-semibold">Football age group</span>
       <select id="organiser-ageGroup" className={`mt-1 block w-full rounded-xl border p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 ${message('ageGroup')?'border-red-500':'border-neutral-300'}`} value={ageGroupOther?'__other__':form.ageGroup} onChange={e=>{const v=e.target.value;if(v==='__other__'){setAgeGroupOther(true);field('ageGroup','');}else{setAgeGroupOther(false);field('ageGroup',v);}}} aria-invalid={Boolean(message('ageGroup'))} aria-describedby={message('ageGroup')?'organiser-ageGroup-error':undefined}>
         <option value="">Select an age group</option>
         {FOOTBALL_AGE_GROUPS.map(g=><option key={g} value={g}>{g}</option>)}
         <option value="__other__">Other (please specify)</option>
       </select>
       {ageGroupOther&&<input aria-label="Football age group, other" placeholder="e.g. Mixed U10/U11" className="mt-2 block w-full rounded-xl border border-neutral-300 p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600" value={form.ageGroup} onChange={e=>field('ageGroup',e.target.value)}/>}
       {message('ageGroup')&&<span id="organiser-ageGroup-error" role="alert" className="mt-1 block text-sm font-semibold text-red-700">{message('ageGroup')}</span>}
     </label>
     <Text id="organiser-expectedSquadSize" label="Estimated squad size" type="number" min="1" value={form.expectedSquadSize} set={v=>field('expectedSquadSize',v)} error={message('expectedSquadSize')}/>
     <PricingProjectionCard projection={incentiveProjection} squadSize={squadSizeNum}/>
   </fieldset>
   <fieldset className="grid gap-4 border-t pt-6">
     <legend className="text-xs font-bold uppercase tracking-wide text-neutral-500">Invitation plan</legend>
     <Text id="organiser-deadlineAt" label="Proposed invitation deadline" type="date" value={form.deadlineAt} set={v=>field('deadlineAt',v)} error={message('deadlineAt')}/>
   </fieldset>
   <fieldset className="grid gap-4 border-t pt-6">
     <legend className="text-xs font-bold uppercase tracking-wide text-neutral-500">Delivery contact</legend>
     <p className="-mt-1 font-semibold">Who should receive the team&apos;s cards?</p>
     <Text id="organiser-deliveryRecipientName" label="Delivery recipient's full name" hint="The adult who will accept the completed team delivery. This can be you." autoComplete="name" value={form.deliveryRecipientName} set={v=>field('deliveryRecipientName',v)} error={message('deliveryRecipientName')}/>
     <label htmlFor="organiser-deliveryRecipientRole" className="block">
       <span className="font-semibold">Their role at the club or team</span>
       <span className="mt-1 block text-sm text-neutral-500">For example: head coach, team manager or club secretary.</span>
       <select id="organiser-deliveryRecipientRole" className={`mt-1 block w-full rounded-xl border p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 ${message('deliveryRecipientRole')?'border-red-500':'border-neutral-300'}`} value={deliveryRoleOther?'__other__':form.deliveryRecipientRole} onChange={e=>{const v=e.target.value;if(v==='__other__'){setDeliveryRoleOther(true);field('deliveryRecipientRole','');}else{setDeliveryRoleOther(false);field('deliveryRecipientRole',v);}}} aria-invalid={Boolean(message('deliveryRecipientRole'))} aria-describedby={message('deliveryRecipientRole')?'organiser-deliveryRecipientRole-error':undefined}>
         <option value="">Select a role</option>
         {DELIVERY_RECIPIENT_ROLES.map(r=><option key={r} value={r}>{r}</option>)}
         <option value="__other__">Other</option>
       </select>
       {deliveryRoleOther&&<input aria-label="Their role at the club or team, other" placeholder="e.g. Team welfare officer" className="mt-2 block w-full rounded-xl border border-neutral-300 p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600" value={form.deliveryRecipientRole} onChange={e=>field('deliveryRecipientRole',e.target.value)}/>}
       {message('deliveryRecipientRole')&&<span id="organiser-deliveryRecipientRole-error" role="alert" className="mt-1 block text-sm font-semibold text-red-700">{message('deliveryRecipientRole')}</span>}
     </label>
     <Check id="organiser-ukDeliveryConfirmed" checked={form.ukDeliveryConfirmed} onChange={v=>field('ukDeliveryConfirmed',v)} text="I confirm that completed cards will be delivered together to this UK delivery recipient." error={message('ukDeliveryConfirmed')}/>
     <p className="text-sm text-neutral-600">The full delivery address is requested only after approval. Optional badge and coach-card details can be reviewed with staff; no roster upload is accepted.</p>
   </fieldset>
   <fieldset className="grid gap-3 border-t pt-6">
     <legend className="text-xs font-bold uppercase tracking-wide text-neutral-500">Confirmations</legend>
     <Checks form={form} field={field} message={message}/>
   </fieldset>
   <button type="submit" className="min-h-[48px] rounded-xl bg-orange-600 p-3 font-bold text-white transition hover:bg-orange-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600">Review request</button>
 </form>}
 {stage==='review'&&<section className="mt-8 grid gap-4" aria-busy={submitting}>
   <h2 className="text-2xl font-bold">Review your request</h2>
   {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{error}</p>}
   <div className="rounded-2xl border bg-white p-5">
     <p className="text-xs font-bold uppercase tracking-wide text-neutral-500">Organiser</p>
     <dl className="mt-3 grid gap-3"><Summary label="Declared role" value={roleLabels[form.organiserRole]}/></dl>
   </div>
   <div className="rounded-2xl border bg-white p-5">
     <p className="text-xs font-bold uppercase tracking-wide text-neutral-500">Team</p>
     <dl className="mt-3 grid gap-3"><Summary label="Team name" value={form.teamName}/><Summary label="Football age group" value={form.ageGroup}/><Summary label="Estimated squad size" value={form.expectedSquadSize}/></dl>
     {incentiveProjection&&<div className="mt-3"><PricingProjectionCard projection={incentiveProjection} squadSize={squadSizeNum}/></div>}
   </div>
   <div className="rounded-2xl border bg-white p-5">
     <p className="text-xs font-bold uppercase tracking-wide text-neutral-500">Invitation plan</p>
     <dl className="mt-3 grid gap-3"><Summary label="Proposed deadline" value={formatDeadline(form.deadlineAt)}/></dl>
   </div>
   <div className="rounded-2xl border bg-white p-5">
     <p className="text-xs font-bold uppercase tracking-wide text-neutral-500">Delivery contact</p>
     <dl className="mt-3 grid gap-3"><Summary label="Delivery recipient" value={`${form.deliveryRecipientName}, ${form.deliveryRecipientRole}`}/><Summary label="Consolidated UK delivery" value="Confirmed"/></dl>
   </div>
   <div className="rounded-2xl border bg-white p-5">
     <h3 className="text-xs font-bold uppercase tracking-wide text-neutral-500">Your confirmations</h3>
     <ul className="mt-3 grid gap-2 text-sm">{ORGANISER_DECLARATIONS.map(key=><li key={key} className="flex gap-2"><span aria-hidden className="font-bold text-emerald-700">✓</span><span>{declarationLabels[key]}</span></li>)}</ul>
   </div>
   <div className="mt-2 flex flex-col gap-3 sm:flex-row">
     <button type="button" className="min-h-[48px] rounded-xl border-2 border-neutral-300 px-5 font-bold text-neutral-700 transition hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-500" onClick={()=>{setError('');setStage('details');}}>Edit request</button>
     <button type="button" disabled={submitting} className="min-h-[48px] flex-1 rounded-xl bg-orange-600 p-3 font-bold text-white transition hover:bg-orange-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:opacity-60" onClick={submit}>{submitting?'Submitting…':'Submit for staff review'}</button>
   </div>
 </section>}
 {stage==='receipt'&&receipt&&<section className="mt-8 rounded-2xl border bg-white p-6" aria-live="polite">
   <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Request received</p>
   <h2 className="mt-1 text-2xl font-bold">Your Squad Invite request has been received.</h2>
   <p className="mt-3">Reference: <strong>{receipt.publicReference}</strong></p>
   <ol className="mt-5 grid gap-3 text-sm text-neutral-700">
     <li><strong className="text-neutral-900">1. Staff review.</strong> We aim to review controlled-pilot requests within two business days.</li>
     <li><strong className="text-neutral-900">2. We&apos;ll email you.</strong> Staff will email you at this address once your request has been reviewed.</li>
     <li><strong className="text-neutral-900">3. If approved.</strong> Sign in to add delivery details and receive the link to share with parents.</li>
   </ol>
   <a className="mt-5 inline-block font-bold text-orange-600 hover:text-orange-700" href={`/squad-invite/manage/${receipt.publicReference}`}>View request status</a>
 </section>}
 {stage!=='details'&&stage!=='review'&&error&&<p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-red-800">{error}</p>}
 <p className="mt-8 text-sm text-neutral-600">Payments and public profiles remain disabled during this test. Parent participation becomes available only after staff approval and organiser setup.</p>
 </div>;
}
function ErrorSummary({error,errors}:{error:string;errors:ReturnType<typeof validateOrganiserForm>}){return <div role="alert" tabIndex={-1} className="rounded-xl bg-red-50 p-3 text-red-800"><p className="font-bold">{error}</p><ul className="mt-1 list-disc pl-5">{errors.map(item=><li key={item.field}>{item.message}</li>)}</ul></div>}
function Text({id,label,hint,value,set,type='text',min,error,autoComplete}:{id:string;label:string;hint?:string;value:string;set:(v:string)=>void;type?:string;min?:string;error?:string;autoComplete?:string}){const errorId=`${id}-error`;const hintId=`${id}-hint`;const describedBy=[hint?hintId:null,error?errorId:null].filter(Boolean).join(' ')||undefined;return <label htmlFor={id} className="block"><span className="font-semibold">{label}</span>{hint&&<span id={hintId} className="mt-1 block text-sm text-neutral-500">{hint}</span>}<input id={id} className={`mt-1 block w-full rounded-xl border p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 ${error?'border-red-500':'border-neutral-300'}`} type={type} min={min} value={value} onChange={e=>set(e.target.value)} aria-invalid={Boolean(error)} aria-describedby={describedBy} autoComplete={autoComplete}/>{error&&<span id={errorId} role="alert" className="mt-1 block text-sm font-semibold text-red-700">{error}</span>}</label>}
function Check({id,checked,onChange,text,error}:{id:string;checked:boolean;onChange:(v:boolean)=>void;text:string;error?:string}){const errorId=`${id}-error`;return <label htmlFor={id} className="flex items-start gap-3"><input id={id} type="checkbox" className={`mt-0.5 h-5 w-5 shrink-0 accent-orange-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 ${error?'outline outline-2 outline-red-500':''}`} checked={checked} onChange={e=>onChange(e.target.checked)} aria-invalid={Boolean(error)} aria-describedby={error?errorId:undefined}/><span className="text-sm">{text}{error&&<span id={errorId} role="alert" className="mt-1 block font-semibold text-red-700">{error}</span>}</span></label>}
function Checks({form,field,message}:{form:OrganiserForm;field:(k:keyof OrganiserForm,v:boolean)=>void;message:(k:keyof OrganiserForm)=>string|undefined}){return <div className="grid gap-3">{ORGANISER_DECLARATIONS.map(key=><Check key={key} id={`organiser-${key}`} checked={form[key]} onChange={v=>field(key,v)} text={declarationLabels[key]} error={message(key)}/>)}</div>}
function Summary({label,value}:{label:string;value:string}){return <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-3"><dt className="font-semibold text-neutral-600">{label}</dt><dd className="sm:text-right">{value}</dd></div>}
// A summary card, not a paragraph — separates squad size, projected tier,
// the coach-card benefit and the "not a final quote" caveat into their own
// scannable rows rather than one run-on sentence. projectedSquadIncentive()
// itself is untouched (still the sole source of the numbers/thresholds);
// this only changes how its output is presented, in both the details form
// and the review screen.
function PricingProjectionCard({projection,squadSize}:{projection:ReturnType<typeof projectedSquadIncentive>;squadSize:number}){
 if(!projection)return null;
 const tierLabel={single:'Single-player pricing',multi:'Multi-player pricing',squad:'Full Squad pricing'}[projection.tier];
 const coachCard=projection.tier==='squad'?'Included — a free coach card at Full Squad pricing.':'Not yet — unlocked at 10 or more players.';
 return <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4" aria-live="polite">
   <p className="text-xs font-bold uppercase tracking-wide text-orange-700">Projected pricing</p>
   <dl className="mt-2 grid gap-1.5 text-sm">
     <div className="flex justify-between gap-3"><dt className="text-orange-900/70">Estimated squad size</dt><dd className="font-semibold text-orange-950">{squadSize} {squadSize===1?'player':'players'}</dd></div>
     <div className="flex justify-between gap-3"><dt className="text-orange-900/70">Projected tier</dt><dd className="font-semibold text-orange-950">{tierLabel}</dd></div>
     <div className="flex justify-between gap-3"><dt className="text-orange-900/70">Coach card</dt><dd className="font-semibold text-orange-950">{coachCard}</dd></div>
   </dl>
   <p className="mt-3 text-sm text-orange-900">{projection.detail}</p>
   <p className="mt-2 text-xs text-orange-800">Pricing is confirmed once the invitation deadline passes and the real squad size is known. This is an estimate, not a final quote.</p>
 </div>;
}
