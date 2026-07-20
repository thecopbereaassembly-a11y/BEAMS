-- ============================================================================
-- BEAMS · 10 · Platform / Org Hierarchy / Tenancy + Identity + RBAC
-- Depends on: 00_extensions_and_types.sql
-- FKs to `member` (app_user.member_id) are added later in 20_membership_families.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Identity: a login. GLOBAL (not tenant-scoped) — one person, many assemblies.
-- Mirrors Supabase auth.users(id). `member_id` links to the person record.
-- ----------------------------------------------------------------------------
create table app_user (
  id            uuid primary key default gen_random_uuid(),   -- = auth.users.id
  email         citext unique,
  phone         text unique,
  full_name     text not null,
  member_id     uuid,                                          -- FK added in file 20
  is_super_admin boolean not null default false,
  is_active     boolean not null default true,
  last_login_at timestamptz,
  locale        text not null default 'en-GH',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references app_user(id),
  updated_by    uuid references app_user(id)
);

-- ----------------------------------------------------------------------------
-- Org hierarchy (global reference): Region → Area → District → Assembly.
-- ----------------------------------------------------------------------------
create table region (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  code        text unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  created_by  uuid references app_user(id),
  updated_by  uuid references app_user(id)
);

create table area (
  id          uuid primary key default gen_random_uuid(),
  region_id   uuid not null references region(id),
  name        text not null,
  code        text,
  head_title  text,                        -- e.g. 'Area Head', 'Apostle'
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  created_by  uuid references app_user(id),
  updated_by  uuid references app_user(id),
  unique (region_id, name)
);

create table district (
  id          uuid primary key default gen_random_uuid(),
  area_id     uuid not null references area(id),
  name        text not null,
  code        text,
  pastor_name text,                         -- district pastor (denormalized label)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  created_by  uuid references app_user(id),
  updated_by  uuid references app_user(id),
  unique (area_id, name)
);

-- ----------------------------------------------------------------------------
-- Assembly = THE TENANT ROOT. Every domain table's assembly_id points here.
-- ----------------------------------------------------------------------------
create table assembly (
  id            uuid primary key default gen_random_uuid(),
  district_id   uuid not null references district(id),
  name          text not null,
  short_name    text,
  slug          citext not null unique,     -- tenant handle, e.g. 'berea-english'
  language      text not null default 'en', -- English assembly
  address_line  text,
  city          text default 'Accra',
  region_label  text default 'Greater Accra',
  country       text not null default 'GH',
  timezone      text not null default 'Africa/Accra',
  currency      text not null default 'GHS',
  phone         text,
  email         citext,
  logo_path     text,
  founded_on    date,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references app_user(id),
  updated_by    uuid references app_user(id)
);

-- Per-assembly settings (key/value + typed common columns).
create table assembly_setting (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  key           text not null,
  value         jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references app_user(id),
  unique (assembly_id, key)
);

-- Encrypted 3rd-party credentials (SMS/MoMo/email). Secrets stored encrypted;
-- decryption happens server-side only. CONFIDENTIAL.
create table integration_credential (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  provider      text not null,              -- 'arkesel','hubtel','mtn_momo','resend'...
  label         text,
  config        jsonb not null default '{}'::jsonb,   -- non-secret config
  secret_ciphertext bytea,                  -- pgp/pgcrypto-encrypted secret
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references app_user(id),
  updated_by    uuid references app_user(id),
  unique (assembly_id, provider, label)
);

-- Feature flags (tiered rollout + future modules).
create table feature_flag (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid references assembly(id),  -- null = global default
  key           text not null,
  is_enabled    boolean not null default false,
  rollout       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (assembly_id, key)
);

-- Human-friendly sequential numbers (receipts, case numbers) per assembly/scope.
create table numbering_sequence (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  scope         text not null,              -- 'receipt','counselling_case',...
  prefix        text,
  next_value    bigint not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (assembly_id, scope)
);

-- ----------------------------------------------------------------------------
-- RBAC: roles, permissions, matrix, per-assembly role assignments.
-- Roles/permissions are lookup tables so the church can reconfigure them.
-- ----------------------------------------------------------------------------
create table role (
  id            uuid primary key default gen_random_uuid(),
  key           text not null unique,       -- 'super_admin','presiding_elder',...
  name          text not null,
  description   text,
  rank          int  not null default 100,  -- ordering / hierarchy hint
  is_system     boolean not null default false,  -- system roles can't be deleted
  is_assignable boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table permission (
  id            uuid primary key default gen_random_uuid(),
  key           text not null unique,       -- 'member.read','finance.write',...
  module        text not null,              -- 'membership','finance',...
  action        text not null,              -- 'read','write','delete','export','manage'
  description   text,
  is_sensitive  boolean not null default false,  -- counselling/welfare/finance
  created_at    timestamptz not null default now()
);

-- The configurable permission matrix (role × permission), per assembly override
-- allowed: assembly_id null = system default for the role.
create table role_permission (
  id            uuid primary key default gen_random_uuid(),
  role_id       uuid not null references role(id) on delete cascade,
  permission_id uuid not null references permission(id) on delete cascade,
  assembly_id   uuid references assembly(id),  -- null = global default
  is_granted    boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (role_id, permission_id, assembly_id)
);

-- A user's role(s) WITHIN an assembly. Drives JWT claims + RLS.
create table user_assembly_role (
  id            uuid primary key default gen_random_uuid(),
  app_user_id   uuid not null references app_user(id) on delete cascade,
  assembly_id   uuid not null references assembly(id),
  role_id       uuid not null references role(id),
  is_primary    boolean not null default false,  -- default active assembly
  is_active     boolean not null default true,
  granted_by    uuid references app_user(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  unique (app_user_id, assembly_id, role_id)
);

-- Pending user invitations.
create table invitation (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  email         citext,
  phone         text,
  role_id       uuid not null references role(id),
  member_id     uuid,                        -- optionally pre-link a member
  token_hash    text not null,
  status        text not null default 'pending', -- pending|accepted|revoked|expired
  expires_at    timestamptz not null,
  accepted_at   timestamptz,
  invited_by    uuid references app_user(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Known devices/sessions (session management surface; Supabase holds tokens).
create table user_device (
  id            uuid primary key default gen_random_uuid(),
  app_user_id   uuid not null references app_user(id) on delete cascade,
  user_agent    text,
  ip_last       inet,
  last_seen_at  timestamptz,
  is_trusted    boolean not null default false,
  created_at    timestamptz not null default now()
);

-- Auth/security event log (logins, failures, password changes) for security review.
create table auth_event (
  id            uuid primary key default gen_random_uuid(),
  app_user_id   uuid references app_user(id),
  assembly_id   uuid references assembly(id),
  event_type    text not null,              -- 'login','login_failed','logout',...
  ip            inet,
  user_agent    text,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

-- ---- Indexes ----
create index on area(region_id);
create index on district(area_id);
create index on assembly(district_id);
create index on assembly_setting(assembly_id);
create index on integration_credential(assembly_id) where deleted_at is null;
create index on role_permission(role_id);
create index on role_permission(permission_id);
create index on role_permission(assembly_id);
create index on user_assembly_role(app_user_id) where deleted_at is null;
create index on user_assembly_role(assembly_id) where deleted_at is null;
create index on invitation(assembly_id, status);
create index on user_device(app_user_id);
create index on auth_event(app_user_id, created_at desc);
create index on auth_event(assembly_id, created_at desc);
create index on app_user(member_id);
