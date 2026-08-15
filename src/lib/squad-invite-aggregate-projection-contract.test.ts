import { readdirSync, readFileSync, statSync } from 'fs';import { join } from 'path';import { describe,expect,it } from 'vitest';
const read=(p:string)=>readFileSync(p,'utf8');
function squadInviteApiRouteFiles(dir:string):string[]{const out:string[]=[];for(const entry of readdirSync(dir)){const full=join(dir,entry);if(statSync(full).isDirectory()){out.push(...squadInviteApiRouteFiles(full));}else if(entry==='route.ts'){out.push(full);}}return out;}
const CHILD_FIELDS=['display_first_name','display_surname_initial'];
describe('Squad Invite organiser/staff/public projections stay aggregate-only — no child-identifying field ever leaves the write path',()=>{
 it('the organiser dashboard route only ever reads participation counts, never any participant row or column',()=>{const route=read('src/app/api/squad-invites/[id]/dashboard/route.ts');expect(route).toContain("{ head: true, count: 'exact' }");for(const field of CHILD_FIELDS)expect(route).not.toContain(field);expect(route).not.toMatch(/squad_invite_participations['"]\)\s*\.select\(\s*['"](?!id['"])/);});
 it('the staff manifest route projects only package reference/label/status, never a raw participation child field',()=>{const route=read('src/app/api/staff/squad-invites/[id]/manifest/route.ts');for(const field of CHILD_FIELDS)expect(route).not.toContain(field);expect(route).not.toContain('squad_invite_participations');});
 it('no squad-invite-prefixed API route other than the commit write path ever references a child display field',()=>{
  const roots=['src/app/api/squad-invites','src/app/api/squad-invite-requests','src/app/api/squad-invite-links','src/app/api/staff/squad-invites'];
  const offenders:string[]=[];
  for(const root of roots){for(const file of squadInviteApiRouteFiles(root)){const content=read(file);for(const field of CHILD_FIELDS)if(content.includes(field))offenders.push(`${file}:${field}`);}}
  expect(offenders).toEqual([]);
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
 it('the new commit RPC boundary itself never appears in any organiser-reachable route', () => {
  const roots=['src/app/api/squad-invites','src/app/api/squad-invite-requests','src/app/api/squad-invite-links'];
  const offenders:string[]=[];
  for(const root of roots){for(const file of squadInviteApiRouteFiles(root)){const content=read(file);if(content.includes('commit_squad_invite_participation_order'))offenders.push(file);}}
  expect(offenders).toEqual([]);
 });
});
