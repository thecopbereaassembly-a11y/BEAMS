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
  ('Pentecost Men''s Ministry', 'PEMEM', 'movement'),
  ('Pentecost Women''s Movement', 'PEWOMOM', 'movement'),
  ('Youth Ministry', 'YOUTH', 'ministry'),
  ('Pentecost Students & Associates', 'PENSA', 'ministry'),
  ('Children''s Ministry', 'CHILDREN', 'ministry'),
  ('Evangelism Ministry', 'EVANGELISM', 'ministry')
) as m(name, code, category)
where a.slug = 'berea-english'
on conflict (assembly_id, name) do nothing;

-- ---- Standard service types --------------------------------------------------
insert into service_type (assembly_id, name, cadence, default_day)
select a.id, s.name, s.cadence, s.day
from assembly a
cross join (values
  ('Sunday Service', 'weekly', 'Sunday'),
  ('Midweek Service', 'weekly', 'Wednesday'),
  ('Prayer Meeting', 'weekly', 'Friday'),
  ('Home Cell Meeting', 'weekly', 'Wednesday')
) as s(name, cadence, day)
where a.slug = 'berea-english'
on conflict (assembly_id, name) do nothing;

-- ---- Baseline funds ----------------------------------------------------------
insert into fund (assembly_id, name, code)
select a.id, f.name, f.code
from assembly a
cross join (values
  ('General Fund', 'GEN'),
  ('Missions Fund', 'MIS'),
  ('Building Fund', 'BLD'),
  ('Welfare Fund', 'WEL')
) as f(name, code)
where a.slug = 'berea-english'
on conflict (assembly_id, name) do nothing;
