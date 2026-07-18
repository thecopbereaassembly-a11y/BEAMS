-- ============================================================================
-- BEAMS · 60 · Events / Church Calendar
-- Depends on: 30_groups_ministries_leadership.sql
-- ============================================================================

create table event_category (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  name          text not null,                 -- 'Convention','Crusade','Service','Meeting'
  color         text,
  created_at    timestamptz not null default now(),
  unique (assembly_id, name)
);

create table event (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  category_id   uuid references event_category(id),
  title         text not null,
  description   text,
  location      text,
  gps_address   text,
  latitude      numeric(9,6),
  longitude     numeric(9,6),
  starts_at     timestamptz not null,
  ends_at       timestamptz,
  is_all_day    boolean not null default false,
  -- recurrence (RFC 5545 RRULE string; expanded to event_session)
  recurrence_rule text,
  -- scoping: an event may belong to a ministry or home cell
  ministry_id   uuid references ministry(id),
  home_cell_id  uuid references home_cell(id),
  requires_registration boolean not null default false,
  capacity      int,
  visibility    doc_visibility not null default 'assembly',
  status        session_status not null default 'scheduled',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references app_user(id),
  updated_by    uuid references app_user(id),
  -- prevent nonsense time ranges
  check (ends_at is null or ends_at >= starts_at)
);

-- Concrete occurrences (expanded from recurrence, or one row for single events).
create table event_session (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  event_id      uuid not null references event(id) on delete cascade,
  starts_at     timestamptz not null,
  ends_at       timestamptz,
  status        session_status not null default 'scheduled',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table event_registration (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  event_id      uuid not null references event(id) on delete cascade,
  session_id    uuid references event_session(id),
  member_id     uuid references member(id),
  guest_name    text,
  guest_phone   text,
  party_size    int not null default 1,
  status        text not null default 'registered', -- 'registered','waitlist','cancelled'
  registered_at timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references app_user(id),
  unique (event_id, member_id)
);

create table event_attendance (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  event_id      uuid not null references event(id) on delete cascade,
  session_id    uuid references event_session(id),
  member_id     uuid references member(id),
  registration_id uuid references event_registration(id),
  status        attendance_status not null default 'present',
  checked_in_at timestamptz default now(),
  created_at    timestamptz not null default now(),
  created_by    uuid references app_user(id)
);

-- ---- Indexes ----
create index on event(assembly_id, starts_at) where deleted_at is null;
create index on event(category_id);
create index on event(ministry_id);
create index on event(home_cell_id);
create index on event_session(event_id, starts_at);
create index on event_registration(event_id);
create index on event_registration(member_id);
create index on event_attendance(event_id);
create index on event_attendance(member_id);
