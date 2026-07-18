-- ============================================================================
-- BEAMS · 20 · Membership & Families
-- Depends on: 10_platform_identity_rbac.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- member — the person the church ministers to (NOT a login; see app_user).
-- ----------------------------------------------------------------------------
create table member (
  id              uuid primary key default gen_random_uuid(),
  assembly_id     uuid not null references assembly(id),
  member_no       text,                       -- human-friendly ID (per assembly)
  first_name      text not null,
  middle_name     text,
  last_name       text not null,
  preferred_name  text,
  gender          gender,
  date_of_birth   date,
  marital_status  marital_status,
  wedding_anniversary date,
  nationality     text default 'Ghanaian',
  hometown        text,
  national_id     text,                        -- Ghana Card (sensitive)
  photo_path      text,                        -- Supabase Storage key
  -- contact convenience (canonical detail rows in member_contact)
  primary_phone   text,
  primary_email   citext,
  -- location
  residential_address text,
  gps_address     text,                        -- Ghana Post GPS (e.g. GA-123-4567)
  digital_address text,
  landmark        text,
  latitude        numeric(9,6),
  longitude       numeric(9,6),
  -- membership lifecycle (source of truth in membership_status_history)
  current_status  member_state not null default 'member',
  joined_on       date,
  home_cell_id    uuid,                         -- FK added in file 30
  -- discipleship snapshot (records live in baptism_record)
  is_water_baptized boolean not null default false,
  is_holy_spirit_baptized boolean not null default false,
  -- soft profile
  bio             text,
  notes_summary   text,
  is_active       boolean not null default true,
  -- audit contract
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  created_by      uuid references app_user(id),
  updated_by      uuid references app_user(id),
  unique (assembly_id, member_no)
);

-- Now that member exists, wire app_user.member_id → member.
alter table app_user
  add constraint app_user_member_fk
  foreign key (member_id) references member(id);

-- Multiple contact points per member (phones, emails, socials).
create table member_contact (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  member_id     uuid not null references member(id) on delete cascade,
  kind          text not null,                -- 'mobile','whatsapp','email','facebook'
  value         text not null,
  is_primary    boolean not null default false,
  is_verified   boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references app_user(id),
  updated_by    uuid references app_user(id)
);

create table emergency_contact (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  member_id     uuid not null references member(id) on delete cascade,
  name          text not null,
  relationship  text,
  phone         text not null,
  alt_phone     text,
  address       text,
  is_primary    boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references app_user(id),
  updated_by    uuid references app_user(id)
);

create table member_occupation (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  member_id     uuid not null references member(id) on delete cascade,
  job_title     text,
  employer      text,
  industry      text,
  work_address  text,
  is_current    boolean not null default true,
  started_on    date,
  ended_on      date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references app_user(id),
  updated_by    uuid references app_user(id)
);

create table member_education (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  member_id     uuid not null references member(id) on delete cascade,
  level         text,                          -- 'JHS','SHS','Tertiary','Postgrad'
  institution   text,
  field         text,
  qualification text,
  graduated_year int,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references app_user(id),
  updated_by    uuid references app_user(id)
);

-- Skills catalog (configurable) + member links (skills, talents, professions).
create table skill (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid references assembly(id),  -- null = shared catalog
  name          text not null,
  category      text,                          -- 'music','technical','professional'
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (assembly_id, name)
);

create table member_skill (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  member_id     uuid not null references member(id) on delete cascade,
  skill_id      uuid not null references skill(id),
  proficiency   text,                          -- 'beginner','intermediate','expert'
  created_at    timestamptz not null default now(),
  created_by    uuid references app_user(id),
  unique (member_id, skill_id)
);

-- Free-text talents/gifts not in the catalog.
create table member_talent (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  member_id     uuid not null references member(id) on delete cascade,
  name          text not null,
  description   text,
  created_at    timestamptz not null default now(),
  created_by    uuid references app_user(id)
);

-- Membership status change history (source of truth; supports transfers).
create table membership_status_history (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  member_id     uuid not null references member(id) on delete cascade,
  status        member_state not null,
  effective_on  date not null default current_date,
  reason        text,
  from_assembly_id uuid references assembly(id),   -- transfers
  to_assembly_id   uuid references assembly(id),
  created_at    timestamptz not null default now(),
  created_by    uuid references app_user(id)
);

-- Baptism records (water + Holy Spirit) — richer than booleans.
create table baptism_record (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  member_id     uuid not null references member(id) on delete cascade,
  type          baptism_type not null,
  baptized_on   date,
  officiant_name text,
  location      text,
  evidence_note text,                          -- e.g. speaking in tongues (H.S.)
  certificate_path text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references app_user(id),
  updated_by    uuid references app_user(id),
  unique (member_id, type)
);

-- Notes on a member (pastoral, general). Sensitive notes flagged private.
create table member_note (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  member_id     uuid not null references member(id) on delete cascade,
  body          text not null,
  privacy       privacy_level not null default 'leaders_only',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references app_user(id),
  updated_by    uuid references app_user(id)
);

-- Flexible tagging (reused across modules; polymorphic via tag_assignment).
create table tag (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  name          text not null,
  color         text,
  created_at    timestamptz not null default now(),
  unique (assembly_id, name)
);

create table member_tag (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  member_id     uuid not null references member(id) on delete cascade,
  tag_id        uuid not null references tag(id) on delete cascade,
  created_at    timestamptz not null default now(),
  created_by    uuid references app_user(id),
  unique (member_id, tag_id)
);

-- Documents attached to a member (points at storage; see attachment/document).
create table member_document (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  member_id     uuid not null references member(id) on delete cascade,
  title         text not null,
  storage_path  text not null,
  mime_type     text,
  size_bytes    bigint,
  privacy       privacy_level not null default 'leaders_only',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references app_user(id),
  updated_by    uuid references app_user(id)
);

-- Bulk import batches (for member CSV/Excel imports; supports rollback/audit).
create table import_batch (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  entity        text not null,                -- 'member', ...
  source_file   text,
  total_rows    int,
  imported_rows int,
  failed_rows   int,
  status        text not null default 'processing',
  error_report  jsonb,
  created_at    timestamptz not null default now(),
  created_by    uuid references app_user(id)
);

-- ----------------------------------------------------------------------------
-- Families / households.
-- ----------------------------------------------------------------------------
create table family (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  name          text not null,                -- 'The Mensah Family'
  head_member_id uuid references member(id),
  address       text,
  gps_address   text,
  home_phone    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references app_user(id),
  updated_by    uuid references app_user(id)
);

create table family_member (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  family_id     uuid not null references family(id) on delete cascade,
  member_id     uuid not null references member(id) on delete cascade,
  relationship  text not null,                -- 'head','spouse','child','dependant'
  is_head       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references app_user(id),
  updated_by    uuid references app_user(id),
  unique (family_id, member_id)
);

-- ---- Indexes ----
create index on member(assembly_id) where deleted_at is null;
create index on member(assembly_id, current_status) where deleted_at is null;
create index on member(assembly_id, home_cell_id) where deleted_at is null;
create index on member(date_of_birth);
create index on member using gin ((first_name || ' ' || last_name) gin_trgm_ops);
create index on member_contact(member_id);
create index on member_contact(assembly_id, value);
create index on emergency_contact(member_id);
create index on member_occupation(member_id);
create index on member_education(member_id);
create index on member_skill(member_id);
create index on member_talent(member_id);
create index on membership_status_history(member_id, effective_on desc);
create index on baptism_record(member_id);
create index on member_note(member_id) where deleted_at is null;
create index on member_tag(tag_id);
create index on member_document(member_id) where deleted_at is null;
create index on family(assembly_id) where deleted_at is null;
create index on family_member(family_id);
create index on family_member(member_id);
