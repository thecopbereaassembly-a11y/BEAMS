-- ============================================================================
-- BEAMS · 50 · Counselling † · Welfare † · Prayer · Evangelism
-- Depends on: 40_attendance_visitors_shepherding.sql
-- † CONFIDENTIAL: extra-restricted RLS (explicit permission) + mandatory audit.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Counselling (CONFIDENTIAL).
-- ----------------------------------------------------------------------------
create table counselling_category (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  name          text not null,                 -- 'Marriage','Grief','Financial','Spiritual'
  created_at    timestamptz not null default now(),
  unique (assembly_id, name)
);

create table counselling_case (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  case_no       text,                          -- numbering_sequence('counselling_case')
  member_id     uuid references member(id),    -- subject (may be a couple/family)
  category_id   uuid references counselling_category(id),
  title         text,
  status        case_status not null default 'open',
  opened_on     date not null default current_date,
  closed_on     date,
  assigned_counsellor_id uuid references app_user(id),
  is_confidential boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references app_user(id),
  updated_by    uuid references app_user(id),
  unique (assembly_id, case_no)
);

create table counselling_session (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  case_id       uuid not null references counselling_case(id) on delete cascade,
  session_on    timestamptz not null,
  location      text,
  counsellor_id uuid references app_user(id),
  summary       text,
  next_steps    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references app_user(id),
  updated_by    uuid references app_user(id)
);

create table counselling_note (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  session_id    uuid not null references counselling_session(id) on delete cascade,
  body          text not null,
  created_at    timestamptz not null default now(),
  created_by    uuid references app_user(id)
);

-- ----------------------------------------------------------------------------
-- Welfare / benevolence (CONFIDENTIAL). Disbursement links to Finance.
-- ----------------------------------------------------------------------------
create table welfare_category (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  name          text not null,                 -- 'Bereavement','Medical','Education'
  created_at    timestamptz not null default now(),
  unique (assembly_id, name)
);

create table welfare_case (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  case_no       text,
  member_id     uuid references member(id),
  category_id   uuid references welfare_category(id),
  title         text not null,
  description   text,
  status        case_status not null default 'open',
  requested_on  date not null default current_date,
  amount_requested numeric(14,2),
  amount_approved  numeric(14,2),
  currency      text not null default 'GHS',
  approved_by   uuid references app_user(id),
  approved_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references app_user(id),
  updated_by    uuid references app_user(id),
  unique (assembly_id, case_no)
);

create table welfare_assessment (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  welfare_case_id uuid not null references welfare_case(id) on delete cascade,
  assessor_id   uuid references app_user(id),
  findings      text,
  recommendation text,
  assessed_on   date not null default current_date,
  created_at    timestamptz not null default now(),
  created_by    uuid references app_user(id)
);

create table welfare_disbursement (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  welfare_case_id uuid not null references welfare_case(id) on delete cascade,
  amount        numeric(14,2) not null,
  currency      text not null default 'GHS',
  channel       contribution_channel not null default 'cash',
  disbursed_on  date not null default current_date,
  expenditure_id uuid,                         -- FK added in 70_finance.sql
  reference     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references app_user(id),
  updated_by    uuid references app_user(id)
);

-- ----------------------------------------------------------------------------
-- Prayer requests.
-- ----------------------------------------------------------------------------
create table prayer_category (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  name          text not null,
  created_at    timestamptz not null default now(),
  unique (assembly_id, name)
);

create table prayer_request (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  member_id     uuid references member(id),    -- requester (nullable: on-behalf/anon)
  requester_name text,                          -- when no member link
  category_id   uuid references prayer_category(id),
  title         text,
  body          text not null,
  privacy       privacy_level not null default 'leaders_only',
  status        text not null default 'open',  -- 'open','praying','answered','closed'
  is_answered   boolean not null default false,
  answered_on   date,
  assigned_to   uuid references app_user(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references app_user(id),
  updated_by    uuid references app_user(id)
);

create table prayer_update (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  prayer_request_id uuid not null references prayer_request(id) on delete cascade,
  body          text not null,
  is_testimony  boolean not null default false,
  created_at    timestamptz not null default now(),
  created_by    uuid references app_user(id)
);

-- ----------------------------------------------------------------------------
-- Evangelism — outreach programs & new-convert pipeline.
-- ----------------------------------------------------------------------------
create table evangelism_program (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  name          text not null,
  description   text,
  location      text,
  starts_on     date,
  ends_on       date,
  lead_member_id uuid references member(id),
  target_souls  int,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references app_user(id),
  updated_by    uuid references app_user(id)
);

create table soul_won (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  program_id    uuid references evangelism_program(id),
  full_name     text not null,
  gender        gender,
  phone         text,
  address       text,
  won_on        date not null default current_date,
  won_by_member_id uuid references member(id),
  decision      text,                          -- 'first_time','rededication'
  visitor_id    uuid references visitor(id),
  converted_member_id uuid references member(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references app_user(id),
  updated_by    uuid references app_user(id)
);

create table convert_followup (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  soul_won_id   uuid not null references soul_won(id) on delete cascade,
  followup_id   uuid references followup(id),  -- link into shepherding engine
  stage         text,                          -- 'contacted','foundation_school','integrated'
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references app_user(id)
);

-- ---- Indexes ----
create index on counselling_case(assembly_id, status) where deleted_at is null;
create index on counselling_case(member_id);
create index on counselling_session(case_id, session_on desc);
create index on counselling_note(session_id);
create index on welfare_case(assembly_id, status) where deleted_at is null;
create index on welfare_case(member_id);
create index on welfare_assessment(welfare_case_id);
create index on welfare_disbursement(welfare_case_id);
create index on prayer_request(assembly_id, status) where deleted_at is null;
create index on prayer_request(member_id);
create index on prayer_update(prayer_request_id);
create index on evangelism_program(assembly_id) where deleted_at is null;
create index on soul_won(assembly_id, won_on desc);
create index on soul_won(program_id);
create index on convert_followup(soul_won_id);
