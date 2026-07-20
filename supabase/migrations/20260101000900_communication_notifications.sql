-- ============================================================================
-- BEAMS · 80 · Communication (SMS/Email campaigns) · Notifications
-- Depends on: 20_membership_families.sql
-- ============================================================================

-- Reusable message templates (with {{variables}}).
create table message_template (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  name          text not null,
  channel       message_channel not null,
  subject       text,                          -- email
  body          text not null,
  variables     jsonb not null default '[]'::jsonb,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references app_user(id),
  updated_by    uuid references app_user(id),
  unique (assembly_id, name)
);

-- Saved audiences (dynamic query or static list) for targeting.
create table audience_segment (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  name          text not null,
  kind          text not null default 'dynamic', -- 'dynamic'|'static'
  definition    jsonb not null default '{}'::jsonb, -- filter spec (e.g. absent_4wks)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references app_user(id),
  unique (assembly_id, name)
);

-- A send (SMS/email blast). Tracks cost + delivery outcomes.
create table message_campaign (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  name          text,
  channel       message_channel not null,
  template_id   uuid references message_template(id),
  segment_id    uuid references audience_segment(id),
  subject       text,
  body          text not null,
  status        text not null default 'draft', -- 'draft','scheduled','sending','sent','failed'
  scheduled_at  timestamptz,
  sent_at       timestamptz,
  provider      text,                          -- 'arkesel','hubtel','resend'
  recipients_count int not null default 0,
  delivered_count  int not null default 0,
  failed_count     int not null default 0,
  cost_total    numeric(14,4) not null default 0,
  cost_currency text not null default 'GHS',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references app_user(id),
  updated_by    uuid references app_user(id)
);

-- Per-recipient delivery row (also the SMS/email delivery log).
create table message_recipient (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  campaign_id   uuid not null references message_campaign(id) on delete cascade,
  member_id     uuid references member(id),
  to_address    text not null,                 -- phone or email
  status        delivery_status not null default 'queued',
  provider_ref  text,                          -- for webhook status matching
  cost          numeric(14,4),
  error         text,
  sent_at       timestamptz,
  delivered_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Consent / opt-out per member per channel (Data Protection Act alignment).
create table communication_consent (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  member_id     uuid not null references member(id) on delete cascade,
  channel       message_channel not null,
  status        consent_status not null default 'opted_in',
  updated_reason text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references app_user(id),
  unique (member_id, channel)
);

-- ----------------------------------------------------------------------------
-- Notifications (in-app + delivered). Distinct from campaigns: system-generated.
-- ----------------------------------------------------------------------------
create table notification_template (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid references assembly(id),  -- null = system default
  key           text not null,                 -- 'followup.assigned','birthday.today'
  title         text not null,
  body          text not null,
  default_channels jsonb not null default '["in_app"]'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (assembly_id, key)
);

create table notification (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  recipient_user_id uuid not null references app_user(id) on delete cascade,
  type          text not null,
  title         text not null,
  body          text,
  link          text,                          -- deep link into the app
  entity_type   text,
  entity_id     uuid,
  is_read       boolean not null default false,
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);

create table notification_delivery (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  notification_id uuid not null references notification(id) on delete cascade,
  channel       message_channel not null,
  status        delivery_status not null default 'queued',
  provider_ref  text,
  error         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table notification_preference (
  id            uuid primary key default gen_random_uuid(),
  assembly_id   uuid not null references assembly(id),
  app_user_id   uuid not null references app_user(id) on delete cascade,
  type          text not null,                 -- notification type/key
  channel       message_channel not null,
  is_enabled    boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (app_user_id, type, channel)
);

-- ---- Indexes ----
create index on message_template(assembly_id) where deleted_at is null;
create index on audience_segment(assembly_id);
create index on message_campaign(assembly_id, created_at desc) where deleted_at is null;
create index on message_campaign(status);
create index on message_recipient(campaign_id);
create index on message_recipient(member_id);
create index on message_recipient(provider_ref);
create index on communication_consent(member_id);
create index on notification(recipient_user_id, is_read, created_at desc);
create index on notification(assembly_id, created_at desc);
create index on notification_delivery(notification_id);
create index on notification_preference(app_user_id);
