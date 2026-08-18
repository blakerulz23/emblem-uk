import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
const source=readFileSync('src/app/squad-invite/start/OrganiserStart.tsx','utf8');
describe('organiser review-stage UI contract',()=>{
 it('uses an explicit non-mutating form review transition with useful focus handling',()=>{expect(source).toContain('onSubmit={review} noValidate');expect(source).toContain("setStage('review')");expect(source).toContain('errors[0].field');expect(source).toContain('Check the highlighted fields');});
 it('does not call the request API from the review handler',()=>{const review=source.slice(source.indexOf('const review='),source.indexOf('const submit='));expect(review).not.toContain("fetch('/api/squad-invite-requests'");});
 it('calls the request API only from the final review screen and prevents duplicate submission',()=>{expect(source).toContain("fetch('/api/squad-invite-requests'");expect(source).toContain('if(submitting)return');expect(source).toContain("submissionKey.current??=crypto.randomUUID()");expect(source).toContain('Submit for staff review');});
 it('shows all requested summary fields, declarations and edit action',()=>{for(const text of ['Declared role','Team name','Football age group','Estimated squad size','Proposed deadline','Delivery recipient','Consolidated UK delivery','Your confirmations','Edit request'])expect(source).toContain(text);});
 it('preserves form state when returning from review',()=>{expect(source).toContain("setStage('details')");expect(source).not.toContain('setForm(initialOrganiserForm)');});
});
