-- ============================================================================
-- BEAMS · 30 · Home Cells · Ministries · Leadership
-- Depends on: 20_membership_families.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Home Cells (Bacenta-style) — primary shepherding + weekly attendance unit.
-- ----------------------------------------------------------------------------
create table home_cell (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  name          text not null,
  code          text,
  leader_member_id uuid references member(id),
  assistant_member_id uuid references member(id),
  meeting_day   text,                          -- 'Wednesday'
  meeting_time  time,
  location      text,
  gps_address   text,
  latitude      numeric(9,6),
  longitude     numeric(9,6),
  parent_cell_id uuid references home_cell(id), -- multiplication lineage
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references app_user(id),
  updated_by    uuid references app_user(id),
  unique (assembly_id, name)
);

-- Wire member.home_cell_id now that home_cell exists.
alter table member
  add constraint member_home_cell_fk
  foreign key (home_cell_id) references home_cell(id);

create table home_cell_member (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  home_cell_id  uuid not null references home_cell(id) on delete cascade,
  member_id     uuid not null references member(id) on delete cascade,
  role          text not null default 'member',  -- 'leader','assistant','member'
  joined_on     date default current_date,
  left_on       date,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references app_user(id),
  updated_by    uuid references app_user(id),
  unique (home_cell_id, member_id)
);

create table home_cell_meeting (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  home_cell_id  uuid not null references home_cell(id) on delete cascade,
  met_on        date not null,
  topic         text,
  status        session_status not null default 'scheduled',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references app_user(id),
  updated_by    uuid references app_user(id),
  unique (home_cell_id, met_on)
);

create table home_cell_attendance (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  meeting_id    uuid not null references home_cell_meeting(id) on delete cascade,
  member_id     uuid references member(id),    -- null allowed for visitor line
  visitor_name  text,
  status        attendance_status not null default 'present',
  created_at    timestamptz not null default now(),
  created_by    uuid references app_user(id),
  unique (meeting_id, member_id)
);

create table home_cell_report (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  home_cell_id  uuid not null references home_cell(id) on delete cascade,
  meeting_id    uuid references home_cell_meeting(id),
  report_date   date not null,
  attendance_count int,
  visitors_count   int default 0,
  offering_amount  numeric(14,2) default 0,
  offering_currency text default 'GHS',
  testimonies   text,
  prayer_points text,
  absentees_note text,
  followups_note text,
  submitted_by  uuid references member(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references app_user(id),
  updated_by    uuid references app_user(id)
);

-- ----------------------------------------------------------------------------
-- Ministries / Movements (PEMEM, PEWOMOM, Youth, PENSA, Children, Evangelism…).
-- ----------------------------------------------------------------------------
create table ministry (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  name          text not null,
  code          text,                          -- 'PEMEM','PEWOMOM','YOUTH'
  category      text,                          -- 'movement','ministry','committee'
  description   text,
  leader_member_id uuid references member(id),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references app_user(id),
  updated_by    uuid references app_user(id),
  unique (assembly_id, name)
);

create table ministry_role (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  ministry_id   uuid not null references ministry(id) on delete cascade,
  name          text not null,                 -- 'President','Secretary','Member'
  created_at    timestamptz not null default now(),
  unique (ministry_id, name)
);

create table ministry_member (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  ministry_id   uuid not null references ministry(id) on delete cascade,
  member_id     uuid not null references member(id) on delete cascade,
  ministry_role_id uuid references ministry_role(id),
  joined_on     date default current_date,
  left_on       date,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references app_user(id),
  updated_by    uuid references app_user(id),
  unique (ministry_id, member_id)
);

create table ministry_meeting (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  ministry_id   uuid not null references ministry(id) on delete cascade,
  met_on        date not null,
  title         text,
  status        session_status not null default 'scheduled',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references app_user(id),
  updated_by    uuid references app_user(id)
);

create table ministry_attendance (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  meeting_id    uuid not null references ministry_meeting(id) on delete cascade,
  member_id     uuid not null references member(id),
  status        attendance_status not null default 'present',
  created_at    timestamptz not null default now(),
  created_by    uuid references app_user(id),
  unique (meeting_id, member_id)
);

create table ministry_report (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  ministry_id   uuid not null references ministry(id) on delete cascade,
  period_start  date,
  period_end    date,
  summary       text,
  metrics       jsonb not null default '{}'::jsonb,
  submitted_by  uuid references member(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references app_user(id),
  updated_by    uuid references app_user(id)
);

-- ----------------------------------------------------------------------------
-- Leadership: officer positions & appointments.
-- ----------------------------------------------------------------------------
create table leadership_position (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid references assembly(id),  -- null = standard CoP catalog
  name          text not null,                 -- 'Presiding Elder','Elder','Deacon'
  category      text,                          -- 'ordained','appointed'
  rank          int not null default 100,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (assembly_id, name)
);

create table leadership_appointment (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  member_id     uuid not null references member(id) on delete cascade,
  position_id   uuid not null references leadership_position(id),
  portfolio     text,
  appointed_on  date,
  ordained_on   date,
  ended_on      date,
  is_current    boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references app_user(id),
  updated_by    uuid references app_user(id)
);

-- ---- Indexes ----
create index on home_cell(assembly_id) where deleted_at is null;
create index on home_cell(leader_member_id);
create index on home_cell_member(home_cell_id) where is_active;
create index on home_cell_member(member_id);
create index on home_cell_meeting(home_cell_id, met_on desc);
create index on home_cell_attendance(meeting_id);
create index on home_cell_report(assembly_id, report_date desc);
create index on ministry(assembly_id) where deleted_at is null;
create index on ministry_member(ministry_id) where is_active;
create index on ministry_member(member_id);
create index on ministry_meeting(ministry_id, met_on desc);
create index on ministry_attendance(meeting_id);
create index on ministry_report(ministry_id);
create index on leadership_appointment(member_id) where is_current;
create index on leadership_appointment(assembly_id, position_id) where is_current;
