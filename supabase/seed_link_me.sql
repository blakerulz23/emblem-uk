-- Emblem OS — link the currently-signed-in user to test data
--
-- Run this AFTER you've signed in to the deployed app at least once
-- (so your row exists in auth.users). It links your profile to
-- "Test Kid Testerson" as both a guardian AND a coach, so you can
-- exercise both flows with one account.
--
-- If you want to test with separate parent and coach accounts, sign
-- both in first, then run the guardian insert with parent's email and
-- the coach_team insert with coach's email.

-- 1) Create your profile row if it doesn't exist yet, and set role.
--    The sign-in flow calls this automatically after RoleSelect, but
--    running this manually is fine too.
insert into profiles (id, role, display_name)
select u.id, 'parent', split_part(u.email, '@', 1)
from auth.users u
where u.email = 'REPLACE_WITH_YOUR_EMAIL@example.com'
on conflict (id) do update set role = excluded.role;

-- 2) Link you as a guardian of the test player.
insert into guardians (profile_id, player_id, relationship)
select u.id, '33333333-3333-3333-3333-333333333333', 'parent'
from auth.users u
where u.email = 'REPLACE_WITH_YOUR_EMAIL@example.com'
on conflict do nothing;

-- 3) Also link you as a coach on the test team (dual-role for testing).
insert into coach_team (team_id, profile_id)
select '22222222-2222-2222-2222-222222222222', u.id
from auth.users u
where u.email = 'REPLACE_WITH_YOUR_EMAIL@example.com'
on conflict do nothing;

-- Sanity check — should show one row per link
select p.role, p.display_name, g.player_id, ct.team_id
from profiles p
left join guardians g on g.profile_id = p.id
left join coach_team ct on ct.profile_id = p.id
where p.id = (select id from auth.users where email = 'REPLACE_WITH_YOUR_EMAIL@example.com');
