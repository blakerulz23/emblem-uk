-- Fix: tables created via the Supabase SQL Editor don't automatically
-- inherit the anon/authenticated role grants that tables created through
-- the Table Editor UI get. Without this, every query against a
-- Row-Level-Security-protected table fails with "permission denied for
-- table X" before RLS policies are even evaluated — this is a plain
-- Postgres GRANT, a separate layer from the RLS policies in 0001_init.sql.
--
-- Only `authenticated` needs access — every Emblem OS table requires a
-- signed-in Supabase session per the app's design (see ActivationGate),
-- so `anon` gets nothing here.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
