-- ============================================================================
-- BEAMS · 40 · Attendance · Visitors · Shepherding / Follow-up
-- Depends on: 30_groups_ministries_leadership.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Attendance — supports per-person roster AND aggregate headcount services.
-- ----------------------------------------------------------------------------
create table service_type (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  name          text not null,                 -- 'Sunday Service','Midweek','Prayer'
  cadence       text,                          -- 'weekly','monthly','adhoc'
  default_day   text,
  default_time  time,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (assembly_id, name)
);

create table attendance_session (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  service_type_id uuid not null references service_type(id),
  title         text,
  service_date  date not null,
  start_at      timestamptz,
  end_at        timestamptz,
  status        session_status not null default 'open',
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references app_user(id),
  updated_by    uuid references app_user(id),
  unique (assembly_id, service_type_id, service_date)
);

-- Per-person attendance (roster style). Idempotent per (session, member).
create table attendance_record (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  session_id    uuid not null references attendance_session(id) on delete cascade,
  member_id     uuid references member(id),    -- null for a walk-in/visitor line
  visitor_id    uuid,                          -- FK added after visitor defined
  status        attendance_status not null default 'present',
  check_in_at   timestamptz default now(),
  captured_offline boolean not null default false,
  client_uuid   uuid,                          -- offline idempotency key
  created_at    timestamptz not null default now(),
  created_by    uuid references app_user(id),
  unique (session_id, member_id)
);

-- Aggregate counts for services where per-person capture is impractical.
create table attendance_count (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  session_id    uuid not null references attendance_session(id) on delete cascade,
  category      text not null,                 -- 'men','women','youth','children','visitors'
  headcount     int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references app_user(id),
  updated_by    uuid references app_user(id),
  unique (session_id, category)
);

-- ----------------------------------------------------------------------------
-- Visitors — first-time & repeat, with a conversion path to member.
-- ----------------------------------------------------------------------------
create table visitor_source (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  name          text not null,                 -- 'Invited by member','Walk-in','Social media'
  created_at    timestamptz not null default now(),
  unique (assembly_id, name)
);

create table visitor (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  first_name    text not null,
  last_name     text,
  gender        gender,
  phone         text,
  email         citext,
  address       text,
  source_id     uuid references visitor_source(id),
  invited_by_member_id uuid references member(id),
  first_visit_on date,
  visit_count   int not null default 1,
  is_converted  boolean not null default false,
  converted_member_id uuid references member(id),
  converted_on  date,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references app_user(id),
  updated_by    uuid references app_user(id)
);

-- Now wire attendance_record.visitor_id → visitor.
alter table attendance_record
  add constraint attendance_record_visitor_fk
  foreign key (visitor_id) references visitor(id);

create table visitor_visit (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  visitor_id    uuid not null references visitor(id) on delete cascade,
  session_id    uuid references attendance_session(id),
  visited_on    date not null default current_date,
  created_at    timestamptz not null default now(),
  created_by    uuid references app_user(id)
);

-- ----------------------------------------------------------------------------
-- Shepherding — the follow-up engine (absentees, visitors, new converts).
-- Unified pastoral-care queue. `reason` + optional typed source refs.
-- ----------------------------------------------------------------------------
create table followup (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  subject_member_id uuid references member(id),     -- who needs care
  subject_visitor_id uuid references visitor(id),    -- or a visitor
  reason        text not null,                 -- 'absent_4_weeks','new_visitor','new_convert','welfare','custom'
  priority      followup_priority not null default 'normal',
  status        followup_status not null default 'open',
  -- optional typed sources (avoid a fragile generic FK)
  source_session_id uuid references attendance_session(id),
  source_visit_id   uuid references visitor_visit(id),
  due_on        date,
  closed_on     date,
  outcome       text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references app_user(id),
  updated_by    uuid references app_user(id),
  check (subject_member_id is not null or subject_visitor_id is not null)
);

-- Who is assigned to a follow-up (shepherd).
create table shepherd_assignment (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  followup_id   uuid not null references followup(id) on delete cascade,
  shepherd_member_id uuid references member(id),
  shepherd_user_id   uuid references app_user(id),
  assigned_at   timestamptz not null default now(),
  is_active     boolean not null default true,
  created_by    uuid references app_user(id)
);

-- Contact-log entries against a follow-up (call, visit, SMS…).
create table followup_activity (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  followup_id   uuid not null references followup(id) on delete cascade,
  activity_type text not null,                 -- 'call','visit','sms','prayer'
  notes         text,
  occurred_at   timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  created_by    uuid references app_user(id)
);

-- ---- Indexes ----
create index on service_type(assembly_id);
create index on attendance_session(assembly_id, service_date desc) where deleted_at is null;
create index on attendance_session(service_type_id, service_date desc);
create index on attendance_record(session_id);
create index on attendance_record(member_id);
create index on attendance_record(assembly_id, member_id, created_at desc);
create index on attendance_count(session_id);
create index on visitor(assembly_id) where deleted_at is null;
create index on visitor(assembly_id, is_converted);
create index on visitor_visit(visitor_id);
create index on followup(assembly_id, status, priority) where deleted_at is null;
create index on followup(subject_member_id);
create index on followup(subject_visitor_id);
create index on shepherd_assignment(followup_id) where is_active;
create index on shepherd_assignment(shepherd_member_id);
create index on followup_activity(followup_id, occurred_at desc);
