import { readdirSync, readFileSync, statSync } from 'fs';import { join } from 'path';import { describe,expect,it } from 'vitest';
const read=(p:string)=>readFileSync(p,'utf8');
function squadInviteApiRouteFiles(dir:string):string[]{const out:string[]=[];for(const entry of readdirSync(dir)){const full=join(dir,entry);if(statSync(full).isDirectory()){out.push(...squadInviteApiRouteFiles(full));}else if(entry==='route.ts'){out.push(full);}}return out;}
const CHILD_FIELDS=['display_first_name','display_surname_initial'];
// The organiser dashboard is a deliberate, narrow, explicitly-authorised
// exception to "aggregate-only": exactly these two fields (the same
// reduced first-name + last-initial already printed on the card), for
// club-mediated parental-authority verification — the organiser already
// knows their own real squad, so seeing this bounded identifier lets them
// notice a name that doesn't belong, which is a real mitigation for a
// documented DPIA risk (R4, incorrect/unverified guardian claim). No other
// field (photo, full surname, DOB, email, guardian identity) is exempted
// by this, and no other route gains this exception — see the dashboard
// route's own comment for the full reasoning.
const DASHBOARD_ROUTE='src/app/api/squad-invites/[id]/dashboard/route.ts';
describe('Squad Invite organiser/staff/public projections stay aggregate-only, except the dashboard\'s one bounded, authorised organiser-safety exception',()=>{
 it('the organiser dashboard route reads participation counts plus exactly the bounded first-name+surname-initial identifier, never anything wider',()=>{const route=read(DASHBOARD_ROUTE);expect(route).toContain("{ head: true, count: 'exact' }");expect(route).toContain(".select('display_first_name,display_surname_initial')");expect(route).not.toMatch(/squad_invite_participations['"]\)\s*\.select\(\s*['"](?!id['"]|display_first_name,display_surname_initial['"])/);});
 it('the staff manifest route projects only package reference/label/status, never a raw participation child field',()=>{const route=read('src/app/api/staff/squad-invites/[id]/manifest/route.ts');for(const field of CHILD_FIELDS)expect(route).not.toContain(field);expect(route).not.toContain('squad_invite_participations');});
 it('no squad-invite-prefixed API route other than the commit write path and the organiser dashboard ever references a child display field',()=>{
  const roots=['src/app/api/squad-invites','src/app/api/squad-invite-requests','src/app/api/squad-invite-links','src/app/api/staff/squad-invites'];
  const EXEMPT=new Set([DASHBOARD_ROUTE.replace(/\//g,'\\')]);
  const offenders:string[]=[];
  for(const root of roots){for(const file of squadInviteApiRouteFiles(root)){if(EXEMPT.has(file))continue;const content=read(file);for(const field of CHILD_FIELDS)if(content.includes(field))offenders.push(`${file}:${field}`);}}
  expect(offenders).toEqual([]);
 });
 it('the dashboard\'s exception is exactly two fields — a future edit widening its select must fail this test',()=>{
  const route=read(DASHBOARD_ROUTE);
  const selects=Array.from(route.matchAll(/squad_invite_participations['"]\)\s*\.select\(\s*['"]([^'"]+)['"]/g)).map(m=>m[1]);
  expect(selects.sort()).toEqual(['display_first_name,display_surname_initial','id']);
 });
 it('the commit route is genuinely write-only for these fields — it forwards them into the RPC, never reads them back out in its response', () => {
  const route=read('src/app/api/squad-invite-participations/[id]/commit/route.ts');
  expect(route).toMatch(/p_display_first_name:\s*body\.displayFirstName/);
  expect(route).not.toMatch(/return NextResponse\.json\([^)]*display_first_name/);
 });
 it('the organiser dashboard never touches orders/players/cards/card_definitions — even indirectly via the new order linkage', () => {
  const route=read('src/app/api/squad-invites/[id]/dashboard/route.ts');
  for (const table of ['orders','players','cards','card_definitions']) expect(route).not.toContain(`.from('${table}')`);
 });
 it('the new commit RPC boundary itself never appears in any organiser-reachable route’s live code (comments may still name it for documentation)', () => {
  const roots=['src/app/api/squad-invites','src/app/api/squad-invite-requests','src/app/api/squad-invite-links'];
  const offenders:string[]=[];
  // Strip block and line comments before scanning — close/route.ts (the
  // organiser self-service campaign-close action) has an accurate doc
  // comment explaining that closing immediately makes
  // commit_squad_invite_participation_order start rejecting new commits;
  // that's documentation, not the route calling or exposing the RPC.
  const stripComments=(src:string)=>src.replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|[^:])\/\/.*$/gm,'$1');
  for(const root of roots){for(const file of squadInviteApiRouteFiles(root)){const content=stripComments(read(file));if(content.includes('commit_squad_invite_participation_order'))offenders.push(file);}}
  expect(offenders).toEqual([]);
 });
});
