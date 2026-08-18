import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/0052_squad_invite_review_foundation.sql','utf8').toLowerCase();

describe('migration 0052 Squad Invite review foundation', () => {
  it('adds narrow reviewer and approver permissions without granting existing staff implicitly', () => {
    expect(sql).toContain("'squad_invite_reviewer','squad_invite_approver'");
    expect(sql).not.toMatch(/insert into public\.squad_invite_staff_permissions[\s\S]*select/);
  });
  it('keeps request, campaign and notification states separate', () => {
    expect(sql).toContain('create table public.squad_invite_requests');
    expect(sql).toContain('create table public.squad_invite_notification_outbox');
    expect(sql).toContain("'approved_setup_required'");
  });
  it('uses one locked security-definer approval transaction and is retry-idempotent', () => {
    expect(sql).toContain('create or replace function public.approve_squad_invite_request');
    expect(sql).toContain('for update');
    expect(sql).toContain("jsonb_build_object('created',false");
    expect(sql).toContain("'approval:v1'");
    expect(sql).toContain('security definer set search_path =');
  });
  it('submits requests and declarations atomically with an idempotent fingerprint', () => {
    expect(sql).toContain('create or replace function public.submit_squad_invite_request');
    expect(sql).toContain('submission key conflict');
    expect(sql).toContain('insert into public.squad_invite_request_declarations');
    expect(sql).toContain("'request_received:v1'");
  });
  it('creates one ownership, paused parent link, outbox item and audit event on approval', () => {
    expect(sql).toContain('insert into public.squad_invite_organiser_ownership');
    expect(sql).toContain("p_parent_link_hash,'paused'");
    expect(sql).toContain('insert into public.squad_invite_notification_outbox');
    expect(sql).toContain('insert into public.squad_invite_audit_events');
  });
  it('keeps tables and approval RPC unavailable to public application roles', () => {
    expect(sql).toContain('from public, anon, authenticated');
    expect(sql).toContain('grant execute on function public.approve_squad_invite_request(uuid,uuid,text) to service_role');
  });
  it('does not store raw link credentials or initial delivery address', () => {
    expect(sql).not.toContain('parent_link_token');
    const requestTable = sql.split('create table public.squad_invite_requests')[1].split(');')[0];
    expect(requestTable).not.toContain('delivery_address');
    expect(requestTable).not.toContain('delivery_postcode');
  });
  it('defers delivery setup and activates only through organiser-owned server transaction',()=>{
    expect(sql).toContain('create or replace function public.complete_squad_invite_delivery_and_activate');
    expect(sql).toContain("v_request.organiser_profile_id<>p_organiser_profile_id");
    expect(sql).toContain("v_campaign.campaign_status<>'approved_setup_required'");
    expect(sql).toContain("campaign_status='active'");
    expect(sql).toContain("'delivery_setup_completed'");
  });
  it('restricts cancellation and disabled resend preparation to explicit approvers',()=>{
    expect(sql).toContain('create or replace function public.cancel_squad_invite_approval');
    expect(sql).toContain('create or replace function public.prepare_squad_invite_notification_resend');
    expect(sql).toContain("permission='squad_invite_approver'");
    expect(sql).toContain("status='disabled_test'");
  });
  it('records review transitions, reasons, restricted notes, audit and outbox in one RPC design',()=>{
    expect(sql).toContain('create or replace function public.review_squad_invite_request');
    expect(sql).toContain("p_action not in ('start_review','request_changes','reject')");
    expect(sql).toContain('insert into public.squad_invite_request_audit_events');
    expect(sql).toContain('on conflict(request_id,event_key) do nothing');
  });
});
