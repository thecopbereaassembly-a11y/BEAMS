-- ============================================================================
-- BEAMS · 70 · Finance † (Mobile-Money-first, channel-agnostic, audit-critical)
-- Depends on: 50_care_prayer_evangelism.sql (welfare_disbursement)
-- † CONFIDENTIAL + audit-critical: strict RLS + mandatory activity_log on writes.
-- ============================================================================

-- Funds/purses money is designated to (General, Missions, Building, Welfare…).
create table fund (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  name          text not null,
  code          text,
  is_restricted boolean not null default false, -- restricted-use fund
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references app_user(id),
  updated_by    uuid references app_user(id),
  unique (assembly_id, name)
);

-- Bank/MoMo/cash accounts money physically sits in.
create table account (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  name          text not null,                 -- 'MTN MoMo - Main','GCB Current'
  type          text not null,                 -- 'momo','bank','cash'
  momo_network  momo_network,                  -- when type='momo'
  account_no    text,
  currency      text not null default 'GHS',
  opening_balance numeric(14,2) not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references app_user(id),
  updated_by    uuid references app_user(id),
  unique (assembly_id, name)
);

create table payment_method (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  name          text not null,                 -- 'MTN MoMo','Cash','Bank transfer'
  channel       contribution_channel not null,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (assembly_id, name)
);

-- Contribution types (tithe, offering, thanksgiving, pledge, project…).
create table contribution_type (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  name          text not null,
  default_fund_id uuid references fund(id),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (assembly_id, name)
);

-- A batch groups contributions collected together (a service's offering count).
create table financial_batch (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  title         text,
  batch_date    date not null default current_date,
  service_session_id uuid references attendance_session(id),
  expected_total numeric(14,2),
  posted_total   numeric(14,2) not null default 0,
  status        text not null default 'open',  -- 'open','posted','reconciled'
  posted_by     uuid references app_user(id),
  posted_at     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references app_user(id),
  updated_by    uuid references app_user(id)
);

-- MoMo transaction ledger — the reconciliation target for live integration.
-- In record-and-reconcile mode these are entered/imported; later, webhook-fed.
create table momo_transaction (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  network       momo_network not null,
  provider_ref  text,                          -- external transaction id
  msisdn        text,                          -- payer phone
  payer_name    text,
  amount        numeric(14,2) not null,
  currency      text not null default 'GHS',
  status        txn_status not null default 'successful',
  occurred_at   timestamptz,
  raw_payload   jsonb,                          -- webhook body (idempotent source)
  is_reconciled boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references app_user(id),
  updated_by    uuid references app_user(id),
  unique (assembly_id, network, provider_ref)  -- idempotency
);

-- Income: a single contribution/giving record.
create table contribution (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  batch_id      uuid references financial_batch(id),
  member_id     uuid references member(id),    -- null = anonymous/loose offering
  contribution_type_id uuid not null references contribution_type(id),
  fund_id       uuid references fund(id),
  account_id    uuid references account(id),
  amount        numeric(14,2) not null check (amount >= 0),
  currency      text not null default 'GHS',
  channel       contribution_channel not null default 'momo',
  payment_method_id uuid references payment_method(id),
  momo_transaction_id uuid references momo_transaction(id),
  reference     text,
  contributed_on date not null default current_date,
  note          text,
  is_anonymous  boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references app_user(id),
  updated_by    uuid references app_user(id)
);

-- Pledges & their payments.
create table pledge (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  member_id     uuid references member(id),
  fund_id       uuid references fund(id),
  campaign      text,                          -- 'Building Fund 2026'
  amount_pledged numeric(14,2) not null,
  amount_paid   numeric(14,2) not null default 0,
  currency      text not null default 'GHS',
  pledged_on    date not null default current_date,
  due_on        date,
  status        text not null default 'active', -- 'active','fulfilled','cancelled'
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references app_user(id),
  updated_by    uuid references app_user(id)
);

create table pledge_payment (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  pledge_id     uuid not null references pledge(id) on delete cascade,
  contribution_id uuid references contribution(id),
  amount        numeric(14,2) not null check (amount > 0),
  paid_on       date not null default current_date,
  created_at    timestamptz not null default now(),
  created_by    uuid references app_user(id)
);

-- Expenditure.
create table expenditure_category (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  name          text not null,
  parent_id     uuid references expenditure_category(id),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (assembly_id, name)
);

create table expenditure (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  category_id   uuid references expenditure_category(id),
  fund_id       uuid references fund(id),
  account_id    uuid references account(id),
  payee         text,
  description   text,
  amount        numeric(14,2) not null check (amount >= 0),
  currency      text not null default 'GHS',
  channel       contribution_channel not null default 'cash',
  spent_on      date not null default current_date,
  reference     text,
  approved_by   uuid references app_user(id),
  approved_at   timestamptz,
  status        text not null default 'recorded', -- 'recorded','approved','void'
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references app_user(id),
  updated_by    uuid references app_user(id)
);

-- Wire welfare_disbursement.expenditure_id → expenditure (defined in file 50).
alter table welfare_disbursement
  add constraint welfare_disbursement_expenditure_fk
  foreign key (expenditure_id) references expenditure(id);

-- Budgets.
create table budget (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  name          text not null,
  period_start  date not null,
  period_end    date not null,
  status        text not null default 'draft',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references app_user(id),
  updated_by    uuid references app_user(id),
  check (period_end >= period_start)
);

create table budget_line (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  budget_id     uuid not null references budget(id) on delete cascade,
  category_id   uuid references expenditure_category(id),
  fund_id       uuid references fund(id),
  planned_amount numeric(14,2) not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Receipts issued for contributions (email/SMS/PDF).
create table receipt (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  receipt_no    text not null,                 -- numbering_sequence('receipt')
  contribution_id uuid references contribution(id),
  member_id     uuid references member(id),
  amount        numeric(14,2) not null,
  currency      text not null default 'GHS',
  issued_on     date not null default current_date,
  channel       message_channel,               -- how it was delivered
  storage_path  text,                          -- PDF in storage
  created_at    timestamptz not null default now(),
  created_by    uuid references app_user(id),
  unique (assembly_id, receipt_no)
);

-- ---- Indexes ----
create index on fund(assembly_id) where deleted_at is null;
create index on account(assembly_id) where deleted_at is null;
create index on contribution_type(assembly_id);
create index on financial_batch(assembly_id, batch_date desc);
create index on momo_transaction(assembly_id, occurred_at desc);
create index on momo_transaction(assembly_id, is_reconciled);
create index on contribution(assembly_id, contributed_on desc) where deleted_at is null;
create index on contribution(member_id, contributed_on desc);
create index on contribution(batch_id);
create index on contribution(contribution_type_id);
create index on contribution(momo_transaction_id);
create index on pledge(assembly_id, status);
create index on pledge(member_id);
create index on pledge_payment(pledge_id);
create index on expenditure(assembly_id, spent_on desc) where deleted_at is null;
create index on expenditure(category_id);
create index on budget(assembly_id, period_start desc);
create index on budget_line(budget_id);
create index on receipt(assembly_id, issued_on desc);
create index on receipt(member_id);
