# Partner data retention: manual procedure

Implements the partner retention wording in the Privacy Policy ("Creator partners and partner codes"). Covers the tables added by migration 0095: `partners`, `partner_codes`, `partner_commissions`, `partner_payouts`.

- **Owner:** Blake. He runs the review or delegates the SQL to someone with production database access, and signs off every deletion.
- **When:** monthly, on the first working day, plus whenever a partnership ends or a partner asks for erasure.
- **How:** by hand, in the Supabase SQL editor (production). **Nothing is deleted automatically.**
- **Permissions:** the app has no route or function that deletes partner data, and none should be added. Clean-up is done only by a person with database owner access, running the reviewed statements below.
  - Supabase's default privileges gave the app's database role (`service_role`) DELETE and TRUNCATE on these tables, which 0095 didn't remove.
  - Migration `0096_partner_tables_service_role_least_privilege.sql` (on PR #128) narrows it to exactly what the app uses: select/insert/update, and select-only on commissions. **Until 0096 is applied and verified in production, the app's role can still delete.**
  - Don't widen permissions to make clean-up easier.

## What the policy promises
| Data | Kept | Then |
|---|---|---|
| Applications that never became an approved partnership (`status` `applied` or `rejected`, with no codes, commissions or payouts) | Until no longer needed, normally **within 12 months of submission** (`created_at`) | Deleted (B1) |
| Active partner information (name, email, profile link, audience note, staff notes, codes) | While needed to run the partnership | When the partnership has ended and nothing is pending: personal details anonymised and codes switched off (B2) |
| Commission, payout and related accounting records | **6 years from the end of the financial year they relate to**, or longer if the law requires | Deleted, together with the anonymised partner row (B3) |

**Financial year: NOT YET CONFIRMED.**
- The accounting steps (A4 review, B3 deletion) **refuse to run** until the confirmed accounting year-end month (1–12) is typed in place of `<REQUIRED: accounting year-end month 1-12>`. There is no default.
- Take the month from LAUDA CARTOONS STUDIO LTD's accounting reference date (Companies House).
- The queries assume the year ends on the last day of that month. If it doesn't, change the `fy_end` expression before use.
- Application clean-up (A1–A3, B1, B2) doesn't depend on the year end and can run now.

**Legal holds:** if there is a dispute, an HMRC enquiry, or any other reason to keep a record, don't delete it. Note the reason in that partner's `staff_notes` and skip it until the hold ends.

## A. Monthly review (read-only; run all four)

```sql
-- [A1] Applications awaiting a decision. Decide (approve or reject) anything older than 30 days.
select id, created_at::date as submitted, now()::date - created_at::date as age_days, name, platform
from public.partners
where status = 'applied'
order by created_at;
```

```sql
-- [A2] Unapproved applications to delete this month: submitted 11+ months ago, never approved
-- (no codes, commissions or payouts). Everything listed must be deleted (B1) before it reaches 12 months.
select p.id, p.status, p.created_at::date as submitted, (p.created_at + interval '12 months')::date as delete_by
from public.partners p
where p.status in ('applied', 'rejected')
  and p.created_at <= now() - interval '11 months'
  and not exists (select 1 from public.partner_codes k where k.partner_id = p.id)
  and not exists (select 1 from public.partner_commissions c where c.partner_id = p.id)
  and not exists (select 1 from public.partner_payouts o where o.partner_id = p.id)
order by p.created_at;
```

```sql
-- [A3] Paused partners whose personal details could be anonymised: nothing pending, every payout sent.
-- Anonymise (B2) only those whose partnership Blake confirms has ENDED; a paused partner may come back.
select p.id, p.name, p.updated_at::date as paused_since,
       (select max(c.created_at)::date from public.partner_commissions c where c.partner_id = p.id) as last_commission
from public.partners p
where p.status = 'paused'
  and p.email not like 'removed+%@invalid'
  and not exists (select 1 from public.partner_commissions c where c.partner_id = p.id and c.status = 'pending')
  and not exists (select 1 from public.partner_payouts o where o.partner_id = p.id and o.sent_at is null)
order by p.updated_at;
```

```sql
-- [A4] Financial records (REQUIRES the confirmed year end, see above): when each anonymised partner's records may be deleted. Its latest
-- commission or payout sets the date: end of that financial year + 6 years. "due" = may be
-- deleted now (B3); anything due within 3 months is listed so it can be planned.
with params as (
  -- REQUIRED, no default: replace the text below with the confirmed accounting year-end month (1-12).
  -- Left as it is, this query stops with: invalid input syntax for type integer.
  select '<REQUIRED: accounting year-end month 1-12>'::integer as fy_end_month
),
guard as (
  -- Refuses a month outside 1-12 ("date field value out of range"). The final select starts
  -- from this row and shows its month, so the check always runs, even when no partner is listed.
  select fy_end_month, make_date(2000, fy_end_month, 1) as checked from params
),
latest as (
  select p.id as partner_id,
         greatest(
           (select max(c.created_at) from public.partner_commissions c where c.partner_id = p.id),
           (select max(coalesce(o.sent_at, o.created_at)) from public.partner_payouts o where o.partner_id = p.id)
         ) as last_record
  from public.partners p
  where p.email like 'removed+%@invalid'
),
fy as (
  select l.partner_id, l.last_record,
         -- last day of the financial year containing last_record
         (case when extract(month from l.last_record) <= prm.fy_end_month
               then make_date(extract(year from l.last_record)::int, prm.fy_end_month, 1)
               else make_date(extract(year from l.last_record)::int + 1, prm.fy_end_month, 1)
          end + interval '1 month' - interval '1 day')::date as fy_end
  from latest l cross join params prm
  where l.last_record is not null
)
-- One row per partner listed; if none is due within 3 months, a single row with an empty
-- partner_id (the year-end month used is always shown).
select extract(month from g.checked)::integer as year_end_month_used, f.partner_id, f.last_record::date as last_record,
       f.fy_end, (f.fy_end + interval '6 years')::date as retain_until,
       (f.fy_end + interval '6 years') <= now() as due
from guard g
left join fy f on (f.fy_end + interval '6 years') <= now() + interval '3 months'
order by retain_until;
```

Anonymised partners with **no** commissions or payouts don't appear in A4. They hold no financial records, so delete them with B1-style care: check with A2's `not exists` conditions, then delete the row.

## B. Clean-up (one statement each, all-or-nothing)
Paste **only ids that came from the review this month** into `v_ids`. Each block re-checks every condition and **refuses the whole run** if any id doesn't qualify, so nothing is partly done. Run a block, read its `NOTICE`, and record it in the log (section C).

```sql
-- [B1] Delete unapproved applications (ids from A2).
do $$
declare
  v_ids uuid[] := '{PASTE-IDS}';
  v_n integer;
begin
  delete from public.partners p
  where p.id = any (v_ids)
    and p.status in ('applied', 'rejected')
    and not exists (select 1 from public.partner_codes k where k.partner_id = p.id)
    and not exists (select 1 from public.partner_commissions c where c.partner_id = p.id)
    and not exists (select 1 from public.partner_payouts o where o.partner_id = p.id);
  get diagnostics v_n = row_count;
  if v_n <> cardinality(v_ids) then
    raise exception 'B1: % of % ids qualified; nothing deleted. Re-run A2.', v_n, cardinality(v_ids);
  end if;
  raise notice 'B1: deleted % unapproved application(s)', v_n;
end $$;
```

```sql
-- [B2] Anonymise ended partnerships (ids from A3, confirmed ended by Blake). Keeps the row
-- (commissions and payouts point at it) but removes name, email, profile, audience and notes,
-- and switches off their codes. ALSO deactivate each code in Shopify Admin.
do $$
declare
  v_ids uuid[] := '{PASTE-IDS}';
  v_n integer;
begin
  update public.partners p
  set name = 'Former partner',
      email = 'removed+' || p.id || '@invalid',
      profile_url = 'https://removed.invalid',
      audience = '',
      staff_notes = null,
      updated_at = now()
  where p.id = any (v_ids)
    and p.status = 'paused'
    and p.email not like 'removed+%@invalid'
    and not exists (select 1 from public.partner_commissions c where c.partner_id = p.id and c.status = 'pending')
    and not exists (select 1 from public.partner_payouts o where o.partner_id = p.id and o.sent_at is null);
  get diagnostics v_n = row_count;
  if v_n <> cardinality(v_ids) then
    raise exception 'B2: % of % ids qualified; nothing changed. Re-run A3.', v_n, cardinality(v_ids);
  end if;
  update public.partner_codes set active = false where partner_id = any (v_ids);
  raise notice 'B2: anonymised % partner(s); their codes are switched off here, now deactivate them in Shopify', v_n;
end $$;
```

```sql
-- [B3] Delete expired financial records (REQUIRES the confirmed year end; ids from A4 with due = true). Deletion order follows
-- the foreign keys: commissions (they reference payouts), then payouts, then the partner row
-- (its codes are deleted with it). Orders are never touched. The payout-balance check
-- (migration 0095) passes because each payout goes in the same statement as its commissions.
do $$
declare
  -- REQUIRED, no default: replace with the confirmed accounting year-end month (1-12), same as A4.
  v_fy_end_text text := '<REQUIRED: accounting year-end month 1-12>';
  v_fy_end_month integer;
  v_ids uuid[] := '{PASTE-IDS}';
  v_due uuid[];
  v_c integer;
  v_o integer;
  v_p integer;
begin
  if v_fy_end_text !~ '^(1[0-2]|[1-9])$' then
    raise exception 'B3 refused: the accounting year-end month is not set. Replace <REQUIRED: accounting year-end month 1-12> with the confirmed month.';
  end if;
  v_fy_end_month := v_fy_end_text::integer;

  select coalesce(array_agg(x.partner_id), '{}') into v_due
  from (
    select p.id as partner_id,
           greatest(
             (select max(c.created_at) from public.partner_commissions c where c.partner_id = p.id),
             (select max(coalesce(o.sent_at, o.created_at)) from public.partner_payouts o where o.partner_id = p.id)
           ) as last_record
    from public.partners p
    where p.id = any (v_ids)
      and p.email like 'removed+%@invalid'
      and not exists (select 1 from public.partner_commissions c where c.partner_id = p.id and c.status = 'pending')
      and not exists (select 1 from public.partner_payouts o where o.partner_id = p.id and o.sent_at is null)
  ) x
  where x.last_record is not null
    and (case when extract(month from x.last_record) <= v_fy_end_month
              then make_date(extract(year from x.last_record)::int, v_fy_end_month, 1)
              else make_date(extract(year from x.last_record)::int + 1, v_fy_end_month, 1)
         end + interval '1 month' - interval '1 day' + interval '6 years') <= now();
  if cardinality(v_due) <> cardinality(v_ids) then
    raise exception 'B3: % of % ids are past retention; nothing deleted. Re-run A4.', cardinality(v_due), cardinality(v_ids);
  end if;

  delete from public.partner_commissions where partner_id = any (v_due);
  get diagnostics v_c = row_count;
  delete from public.partner_payouts where partner_id = any (v_due);
  get diagnostics v_o = row_count;
  delete from public.partners where id = any (v_due);
  get diagnostics v_p = row_count;
  raise notice 'B3: deleted % commission(s), % payout(s), % partner row(s)', v_c, v_o, v_p;
end $$;
```

**Erasure request from an approved partner:** treat it as B2 (anonymise) once nothing is pending and every payout has been sent. Commission and payout records are kept for the accounting period above, which is a legal obligation, and the reply to the partner should say so.

## C. Monthly log
Keep a short private log entry, for example in the acquisition folder:

> date · A1 count / decisions · A2 ids deleted (B1) · A3 ids anonymised (B2) + Shopify codes deactivated · A4 ids deleted (B3) · holds · signed off: Blake

Use ids only. Never copy names or emails into the log.

## Notes
- The statements were tested on a throwaway PostgreSQL 17 database with every repository migration applied (0001–0087, 0095 and the proposed 0096), never on production. They cover:
  - partners that qualify and partners that don't;
  - refusal of a whole run when any id doesn't qualify;
  - foreign-key order and the payout-balance check;
  - the date maths;
  - refusal of A4 and B3 while the year end is missing or invalid.
- If the partner tables change in a later migration, re-review this procedure before the next monthly run.
