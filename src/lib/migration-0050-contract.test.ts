import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/0050_squad_invite_foundation.sql', 'utf8');

describe('migration 0050 Squad Invite contract', () => {
  it.each([
    'squad_invites','squad_invite_participations','squad_invite_permissions',
    'squad_invite_coach_cards','squad_invite_audit_events',
    'campaign_fulfilment_batches','campaign_fulfilment_items',
  ])('creates %s with RLS', (table) => {
    expect(sql).toContain(`create table public.${table}`);
    expect(sql).toContain(`alter table public.${table} enable row level security`);
  });

  it('pins commitment pricing without changing the general pricing engine', () => {
    expect(sql).toContain('squad_invite_commitment_pricing_v1');
    expect(sql).toContain("final_unit_price_pence in (2499,2199,1899)");
    expect(sql).toContain("final_commitment_count = 1 and final_tier = 'single'");
  });

  it('encodes 24-hour grace, 72-hour payment and one batch per campaign', () => {
    expect(sql).toContain("deadline_at + interval '24 hours'");
    expect(sql).toContain("payment_request_issued_at + interval '72 hours'");
    expect(sql).toMatch(/campaign_id uuid not null unique references public\.squad_invites/);
  });

  it('has no direct public, anon or authenticated table access', () => {
    expect(sql).toContain('from public, anon, authenticated');
    expect(sql).not.toMatch(/grant\s+(select|insert|update|delete).*\s+to\s+(anon|authenticated)/i);
  });

  it('uses server-authoritative idempotent pricing and paid-only coach reconciliation', () => {
    expect(sql).toContain('create or replace function public.finalise_squad_invite_pricing');
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("status = 'commitment_completed'");
    expect(sql).toContain('create or replace function public.reconcile_squad_invite_coach_eligibility');
    expect(sql).toContain("status = 'paid'");
    expect(sql).toContain('count(distinct order_id)');
    expect(sql).toContain('from public, anon, authenticated');
  });

  it('keeps private registration and sensitive reviews visibly unresolved', () => {
    expect(sql).toContain("'private_registration'");
    expect(sql).toContain('subject to specialist review');
  });
});
