-- Emblem OS — test seed data
--
-- Inserts one fake club/team/player so the app has something to render
-- before real families onboard. Run this in the Supabase SQL Editor
-- ONCE per fresh project, AFTER 0001_init.sql and 0002_grants.sql.
--
-- WHY the fixed UUIDs: they're referenced by the "link me" queries in
-- seed_link_me.sql so you can paste those without editing UUIDs each time.
--
-- Every value here is fictional. "Test Kid Testerson" is not a real child.

insert into clubs (id, name, badge_url) values
  ('11111111-1111-1111-1111-111111111111', 'Test Athletic Club', null);

insert into teams (id, club_id, name, season) values
  ('22222222-2222-2222-2222-222222222222',
   '11111111-1111-1111-1111-111111111111',
   'Testers FC U10',
   '2026/27');

insert into players (id, team_id, name, "position", age, height, preferred_foot, card_nfc_id) values
  ('33333333-3333-3333-3333-333333333333',
   '22222222-2222-2222-2222-222222222222',
   'Test Kid Testerson',
   'Midfielder',
   10,
   '4''6"',
   'Right',
   'TEST-NFC-0001');

-- Sanity checks
select 'clubs' as table_name, count(*) as row_count from clubs
union all
select 'teams', count(*) from teams
union all
select 'players', count(*) from players;
