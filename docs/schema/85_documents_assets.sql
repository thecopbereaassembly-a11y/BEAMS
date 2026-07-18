-- ============================================================================
-- BEAMS · 85 · Documents · Assets
-- Depends on: 30_groups_ministries_leadership.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Documents — central library with folders, versions, and access control.
-- ----------------------------------------------------------------------------
create table document_folder (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  name          text not null,
  parent_id     uuid references document_folder(id),
  visibility    doc_visibility not null default 'leaders',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references app_user(id),
  updated_by    uuid references app_user(id)
);

create table document (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  folder_id     uuid references document_folder(id),
  title         text not null,
  description   text,
  category      text,                          -- 'constitution','minutes','policy'
  visibility    doc_visibility not null default 'leaders',
  current_version_id uuid,                      -- FK added after document_version
  -- optional links to other entities
  member_id     uuid references member(id),
  ministry_id   uuid references ministry(id),
  event_id      uuid references event(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references app_user(id),
  updated_by    uuid references app_user(id)
);

create table document_version (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  document_id   uuid not null references document(id) on delete cascade,
  version_no    int not null default 1,
  storage_path  text not null,
  mime_type     text,
  size_bytes    bigint,
  checksum      text,
  uploaded_by   uuid references app_user(id),
  created_at    timestamptz not null default now(),
  unique (document_id, version_no)
);

alter table document
  add constraint document_current_version_fk
  foreign key (current_version_id) references document_version(id);

-- Explicit per-role or per-user grants beyond the folder/document visibility.
create table document_access (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  document_id   uuid references document(id) on delete cascade,
  folder_id     uuid references document_folder(id) on delete cascade,
  role_id       uuid references role(id),
  app_user_id   uuid references app_user(id),
  can_view      boolean not null default true,
  can_edit      boolean not null default false,
  created_at    timestamptz not null default now(),
  created_by    uuid references app_user(id),
  check (document_id is not null or folder_id is not null),
  check (role_id is not null or app_user_id is not null)
);

-- ----------------------------------------------------------------------------
-- Assets / inventory register.
-- ----------------------------------------------------------------------------
create table asset_category (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  name          text not null,                 -- 'Instruments','Furniture','Vehicles','IT'
  created_at    timestamptz not null default now(),
  unique (assembly_id, name)
);

create table asset (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  category_id   uuid references asset_category(id),
  tag_no        text,                          -- asset tag / inventory number
  name          text not null,
  description   text,
  serial_no     text,
  location      text,
  condition     asset_condition not null default 'good',
  quantity      int not null default 1,
  acquired_on   date,
  acquisition_cost numeric(14,2),
  current_value numeric(14,2),
  currency      text not null default 'GHS',
  custodian_member_id uuid references member(id),
  photo_path    text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references app_user(id),
  updated_by    uuid references app_user(id),
  unique (assembly_id, tag_no)
);

create table asset_maintenance (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  asset_id      uuid not null references asset(id) on delete cascade,
  maintained_on date not null default current_date,
  description   text,
  cost          numeric(14,2),
  currency      text not null default 'GHS',
  performed_by  text,
  next_due_on   date,
  created_at    timestamptz not null default now(),
  created_by    uuid references app_user(id)
);

create table asset_assignment (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  asset_id      uuid not null references asset(id) on delete cascade,
  assigned_to_member_id uuid references member(id),
  assigned_to_ministry_id uuid references ministry(id),
  assigned_on   date not null default current_date,
  returned_on   date,
  notes         text,
  created_at    timestamptz not null default now(),
  created_by    uuid references app_user(id)
);

-- ---- Indexes ----
create index on document_folder(assembly_id) where deleted_at is null;
create index on document(assembly_id) where deleted_at is null;
create index on document(folder_id);
create index on document_version(document_id, version_no desc);
create index on document_access(document_id);
create index on document_access(folder_id);
create index on asset(assembly_id) where deleted_at is null;
create index on asset(category_id);
create index on asset_maintenance(asset_id, maintained_on desc);
create index on asset_assignment(asset_id) where returned_on is null;
