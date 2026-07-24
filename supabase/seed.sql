-- ============================================================================
-- BEAMS · seed.sql — Berea English Assembly tenant bootstrap.
-- Runs after migrations on `supabase db reset`. Idempotent.
-- (RBAC roles/permissions are seeded by migration 20260101001500_seed_rbac.sql.)
-- ============================================================================

-- ---- Org hierarchy: Greater Accra → Dansoman Area → Sahara District → Berea --
insert into region (name, code) values ('Greater Accra', 'GAR')
  on conflict (name) do nothing;

insert into area (region_id, name, head_title)
select r.id, 'Dansoman Area', 'Area Head'
from region r where r.name = 'Greater Accra'
  on conflict (region_id, name) do nothing;

insert into district (area_id, name, pastor_name)
select a.id, 'Sahara District', 'District Pastor'
from area a where a.name = 'Dansoman Area'
  on conflict (area_id, name) do nothing;

insert into assembly (district_id, name, short_name, slug, language, city,
                      region_label, country, timezone, currency)
select d.id, 'Berea English Assembly', 'Berea', 'berea-english', 'en',
       'Accra', 'Greater Accra', 'GH', 'Africa/Accra', 'GHS'
from district d where d.name = 'Sahara District'
  on conflict (slug) do nothing;

-- ---- Standard CoP leadership positions (global catalog: assembly_id = null) --
insert into leadership_position (assembly_id, name, category, rank) values
 (null, 'Presiding Elder',     'ordained', 10),
 (null, 'Elder',               'ordained', 20),
 (null, 'Deacon',              'ordained', 30),
 (null, 'Deaconess',           'ordained', 30),
 (null, 'Secretary',           'appointed', 40),
 (null, 'Financial Secretary', 'appointed', 40)
on conflict (assembly_id, name) do nothing;

-- ---- Berea ministries / movements -------------------------------------------
insert into ministry (assembly_id, name, code, category)
select a.id, m.name, m.code, m.category
from assembly a
cross join (values
  -- PENSA is a students' movement (schools/tertiary), NOT a local-assembly
  -- ministry, so it is intentionally absent here.
  ('Pentecost Men''s Ministry', 'PEMEM', 'movement'),
  ('Women''s Ministry', 'WOMEN', 'movement'),
  ('Youth Ministry', 'YOUTH', 'ministry'),
  ('Children''s Ministry', 'CHILDREN', 'ministry'),
  ('Evangelism Ministry', 'EVANGELISM', 'ministry')
  -- More ministries can be added any time in-app (Ministries → Add ministry).
) as m(name, code, category)
where a.slug = 'berea-english'
on conflict (assembly_id, name) do nothing;

-- ---- Standard service types --------------------------------------------------
-- Sunday service 07:00–09:30; weekday/evening meetings at 19:00 (Accra = UTC+0).
-- Weekday DAYS are left NULL: the real rhythm is monthly, not a fixed weekday —
-- see docs/17-liturgical-calendar.md and the auto-generated events.
insert into service_type (assembly_id, name, cadence, default_day, default_time)
select a.id, s.name, s.cadence, s.day, s.time::time
from assembly a
cross join (values
  ('Sunday Service', 'weekly', 'Sunday', '07:00:00'),
  ('Midweek Service', 'weekly', null, '19:00:00'),
  ('Prayer Meeting', 'weekly', null, '19:00:00'),
  ('Home Cell Meeting', 'weekly', null, '19:00:00')
) as s(name, cadence, day, time)
where a.slug = 'berea-english'
on conflict (assembly_id, name) do nothing;

-- ---- Funds (money purses) ----------------------------------------------------
insert into fund (assembly_id, name, code)
select a.id, f.name, f.code
from assembly a
cross join (values
  ('General Fund', 'GEN'),
  ('Missions Fund', 'MIS'),
  ('Welfare Fund', 'WEL'),
  ('Building & Projects Fund', 'BLD'),
  ('Ministries Fund', 'MIN')
) as f(name, code)
where a.slug = 'berea-english'
on conflict (assembly_id, name) do nothing;

-- ---- Contribution types (kinds of giving) ------------------------------------
insert into contribution_type (assembly_id, name)
select a.id, t.name
from assembly a
cross join (values
  ('Tithes'), ('Local Offerings'), ('Missions Offerings'),
  ('Welfare'), ('Building & Projects'), ('Ministries Offerings'),
  ('Thanksgiving')
) as t(name)
where a.slug = 'berea-english'
on conflict (assembly_id, name) do nothing;
