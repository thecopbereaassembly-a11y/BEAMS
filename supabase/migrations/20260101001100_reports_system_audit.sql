-- ============================================================================
-- BEAMS · 88 · Reports · System · Audit
-- Depends on: 10_platform_identity_rbac.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Reporting engine (definitions, presets, schedules, runs).
-- ----------------------------------------------------------------------------
create table report_definition (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid references assembly(id),  -- null = built-in report
  key           text not null,                 -- 'attendance','member_growth','giving'
  name          text not null,
  module        text not null,
  description   text,
  param_schema  jsonb not null default '{}'::jsonb,  -- Zod-like param spec
  is_system     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (assembly_id, key)
);

create table saved_report_preset (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  report_definition_id uuid not null references report_definition(id),
  name          text not null,
  params        jsonb not null default '{}'::jsonb,
  owner_user_id uuid references app_user(id),
  is_shared     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table report_schedule (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  report_definition_id uuid not null references report_definition(id),
  preset_id     uuid references saved_report_preset(id),
  cron          text not null,                 -- schedule expression
  format        report_format not null default 'pdf',
  recipients    jsonb not null default '[]'::jsonb, -- emails/user ids
  is_active     boolean not null default true,
  last_run_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references app_user(id)
);

create table report_run (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  report_definition_id uuid references report_definition(id),
  schedule_id   uuid references report_schedule(id),
  params        jsonb not null default '{}'::jsonb,
  format        report_format not null default 'pdf',
  status        job_status not null default 'queued',
  storage_path  text,                          -- generated file
  row_count     int,
  error         text,
  requested_by  uuid references app_user(id),
  started_at    timestamptz,
  finished_at   timestamptz,
  created_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Audit trail — append-only. The tamper-evident record of sensitive actions.
-- ----------------------------------------------------------------------------
create table activity_log (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid references assembly(id),
  actor_user_id uuid references app_user(id),
  actor_label   text,                          -- denormalized name at time of action
  action        text not null,                 -- 'create','update','delete','view','export','login'
  entity_type   text not null,                 -- 'member','contribution','counselling_case'
  entity_id     uuid,
  summary       text,
  before_data   jsonb,
  after_data    jsonb,
  ip            inet,
  user_agent    text,
  created_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- System plumbing.
-- ----------------------------------------------------------------------------

-- Inbound webhook idempotency (MoMo/SMS status callbacks).
create table webhook_event (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid references assembly(id),
  provider      text not null,                 -- 'arkesel','hubtel','mtn_momo'
  event_type    text,
  external_id   text not null,                 -- provider's unique id
  payload       jsonb not null,
  status        text not null default 'received', -- 'received','processed','failed'
  processed_at  timestamptz,
  error         text,
  created_at    timestamptz not null default now(),
  unique (provider, external_id)               -- dedupe retries
);

-- Background job run log (cron sweeps, exports, imports, sends).
create table job_run (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid references assembly(id),
  job_name      text not null,                 -- 'absentee_sweep','birthday_digest'
  status        job_status not null default 'queued',
  scheduled_for timestamptz,
  started_at    timestamptz,
  finished_at   timestamptz,
  result        jsonb,
  error         text,
  created_at    timestamptz not null default now()
);

-- Generic storage-object metadata (files uploaded across modules).
create table attachment (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  bucket        text not null,
  storage_path  text not null,
  file_name     text,
  mime_type     text,
  size_bytes    bigint,
  entity_type   text,                          -- what it's attached to
  entity_id     uuid,
  uploaded_by   uuid references app_user(id),
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

-- ---- Indexes ----
create index on report_definition(assembly_id);
create index on saved_report_preset(assembly_id, report_definition_id);
create index on report_schedule(assembly_id) where is_active;
create index on report_run(assembly_id, created_at desc);
create index on activity_log(assembly_id, created_at desc);
create index on activity_log(entity_type, entity_id);
create index on activity_log(actor_user_id, created_at desc);
create index on webhook_event(provider, status);
create index on job_run(job_name, created_at desc);
create index on attachment(entity_type, entity_id);
create index on attachment(assembly_id) where deleted_at is null;
