-- ============================================================================
-- BEAMS · 90 · Row-Level Security — the tenant-isolation guarantee
-- Depends on: all table files (00–88). Run after 95_functions_triggers.sql too.
--
-- Model: isolation is enforced HERE, in the database, off JWT claims — not by
-- trusting application code. The app layer re-scopes as defense in depth.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Claim helpers — read the authenticated user's context from the Supabase JWT.
-- The JWT `app_metadata` is stamped at login / assembly-switch with:
--   { "assembly_id": "...", "assembly_ids": ["..."], "is_super_admin": bool }
-- ----------------------------------------------------------------------------
create or replace function auth_assembly_id() returns uuid
  language sql stable as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'assembly_id', '')::uuid;
$$;

create or replace function auth_is_super_admin() returns boolean
  language sql stable as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean, false);
$$;

-- Does the current user hold `perm_key` in their active assembly?
-- Resolves the configurable permission matrix (role_permission), honoring
-- per-assembly overrides over global defaults.
create or replace function auth_has_permission(perm_key text) returns boolean
  language sql stable as $$
  with me as (
    select auth.uid() as uid, auth_assembly_id() as aid
  )
  select auth_is_super_admin() or exists (
    select 1
    from me
    join user_assembly_role uar
      on uar.app_user_id = me.uid
     and uar.assembly_id = me.aid
     and uar.is_active
     and uar.deleted_at is null
    join permission p on p.key = perm_key
    join role_permission rp
      on rp.role_id = uar.role_id
     and rp.permission_id = p.id
     and (rp.assembly_id = me.aid or rp.assembly_id is null)
    where rp.is_granted
    -- per-assembly override wins over global default
    order by (rp.assembly_id is not null) desc
    limit 1
  );
$$;

-- ----------------------------------------------------------------------------
-- Standard policy applicator.
-- For most tenant tables the rule is uniform:
--   • SELECT: row.assembly_id = my active assembly (or super admin)
--   • INSERT/UPDATE/DELETE: same tenant AND the caller holds <module>.write
-- We generate these with a helper so the policy is identical everywhere and a
-- change is one edit, not 110. Confidential tables are handled explicitly below.
-- ----------------------------------------------------------------------------
create or replace function beams_apply_standard_rls(
  tbl text, write_perm text
) returns void language plpgsql as $$
begin
  execute format('alter table %I enable row level security;', tbl);
  execute format('alter table %I force row level security;', tbl);

  execute format($p$
    create policy %1$s_select on %1$I for select using (
      auth_is_super_admin() or assembly_id = auth_assembly_id()
    );$p$, tbl);

  execute format($p$
    create policy %1$s_insert on %1$I for insert with check (
      assembly_id = auth_assembly_id() and auth_has_permission(%2$L)
    );$p$, tbl, write_perm);

  execute format($p$
    create policy %1$s_update on %1$I for update using (
      assembly_id = auth_assembly_id() and auth_has_permission(%2$L)
    ) with check (
      assembly_id = auth_assembly_id() and auth_has_permission(%2$L)
    );$p$, tbl, write_perm);

  execute format($p$
    create policy %1$s_delete on %1$I for delete using (
      assembly_id = auth_assembly_id() and auth_has_permission(%2$L)
    );$p$, tbl, write_perm);
end;
$$;

-- Apply standard policies (table → write permission key).
-- (Confidential finance/counselling/welfare intentionally EXCLUDED — see below.)
do $$
declare
  r record;
begin
  for r in
    select * from (values
      -- membership
      ('member','member.write'), ('member_contact','member.write'),
      ('emergency_contact','member.write'), ('member_occupation','member.write'),
      ('member_education','member.write'), ('member_skill','member.write'),
      ('member_talent','member.write'), ('membership_status_history','member.write'),
      ('baptism_record','member.write'), ('member_note','member.write'),
      ('member_tag','member.write'), ('member_document','member.write'),
      ('import_batch','member.write'), ('skill','settings.write'), ('tag','settings.write'),
      ('family','family.write'), ('family_member','family.write'),
      -- groups
      ('home_cell','homecell.write'), ('home_cell_member','homecell.write'),
      ('home_cell_meeting','homecell.write'), ('home_cell_attendance','homecell.write'),
      ('home_cell_report','homecell.write'),
      ('ministry','ministry.write'), ('ministry_role','ministry.write'),
      ('ministry_member','ministry.write'), ('ministry_meeting','ministry.write'),
      ('ministry_attendance','ministry.write'), ('ministry_report','ministry.write'),
      ('leadership_position','leadership.write'), ('leadership_appointment','leadership.write'),
      -- attendance / visitors / shepherding
      ('service_type','settings.write'), ('attendance_session','attendance.write'),
      ('attendance_record','attendance.write'), ('attendance_count','attendance.write'),
      ('visitor_source','settings.write'), ('visitor','visitor.write'),
      ('visitor_visit','visitor.write'), ('followup','shepherding.write'),
      ('shepherd_assignment','shepherding.write'), ('followup_activity','shepherding.write'),
      -- prayer / evangelism (care handled confidentially)
      ('prayer_category','settings.write'), ('prayer_request','prayer.write'),
      ('prayer_update','prayer.write'), ('evangelism_program','evangelism.write'),
      ('soul_won','evangelism.write'), ('convert_followup','evangelism.write'),
      -- events
      ('event_category','settings.write'), ('event','event.write'),
      ('event_session','event.write'), ('event_registration','event.write'),
      ('event_attendance','event.write'),
      -- communication / notifications
      ('message_template','communication.write'), ('audience_segment','communication.write'),
      ('message_campaign','communication.write'), ('message_recipient','communication.write'),
      ('communication_consent','member.write'),
      ('notification_template','settings.write'),
      ('notification_delivery','communication.write'),
      -- documents / assets
      ('document_folder','document.write'), ('document','document.write'),
      ('document_version','document.write'), ('document_access','document.write'),
      ('asset_category','settings.write'), ('asset','asset.write'),
      ('asset_maintenance','asset.write'), ('asset_assignment','asset.write'),
      -- reports / system
      ('saved_report_preset','report.read'), ('report_schedule','report.write'),
      ('report_run','report.read'), ('attachment','member.write'),
      -- settings / platform (assembly-scoped)
      ('assembly_setting','settings.write'), ('feature_flag','settings.write'),
      ('numbering_sequence','settings.write'), ('integration_credential','settings.write')
    ) as t(tbl, perm)
  loop
    perform beams_apply_standard_rls(r.tbl, r.perm);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Notifications: a user sees only THEIR OWN notifications (not the whole tenant).
-- ----------------------------------------------------------------------------
alter table notification enable row level security;
alter table notification force row level security;
create policy notification_select on notification for select using (
  recipient_user_id = auth.uid()
  or (auth_is_super_admin() and assembly_id = auth_assembly_id())
);
create policy notification_update on notification for update using (
  recipient_user_id = auth.uid()
) with check (recipient_user_id = auth.uid());

alter table notification_preference enable row level security;
create policy notif_pref_all on notification_preference for all
  using (app_user_id = auth.uid()) with check (app_user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- CONFIDENTIAL domains — require an EXPLICIT permission for BOTH read and write,
-- beyond mere tenant membership. Finance is read-gated too.
-- ----------------------------------------------------------------------------
create or replace function beams_apply_confidential_rls(
  tbl text, read_perm text, write_perm text
) returns void language plpgsql as $$
begin
  execute format('alter table %I enable row level security;', tbl);
  execute format('alter table %I force row level security;', tbl);
  execute format($p$
    create policy %1$s_select on %1$I for select using (
      assembly_id = auth_assembly_id() and auth_has_permission(%2$L)
    );$p$, tbl, read_perm);
  execute format($p$
    create policy %1$s_write on %1$I for all using (
      assembly_id = auth_assembly_id() and auth_has_permission(%3$L)
    ) with check (
      assembly_id = auth_assembly_id() and auth_has_permission(%3$L)
    );$p$, tbl, read_perm, write_perm);
end;
$$;

do $$
declare r record;
begin
  for r in
    select * from (values
      -- counselling
      ('counselling_category','counselling.read','settings.write'),
      ('counselling_case','counselling.read','counselling.write'),
      ('counselling_session','counselling.read','counselling.write'),
      ('counselling_note','counselling.read','counselling.write'),
      -- welfare
      ('welfare_category','welfare.read','settings.write'),
      ('welfare_case','welfare.read','welfare.write'),
      ('welfare_assessment','welfare.read','welfare.write'),
      ('welfare_disbursement','welfare.read','welfare.write'),
      -- finance
      ('fund','finance.read','finance.write'),
      ('account','finance.read','finance.write'),
      ('payment_method','finance.read','finance.write'),
      ('contribution_type','finance.read','finance.write'),
      ('contribution','finance.read','finance.write'),
      ('pledge','finance.read','finance.write'),
      ('pledge_payment','finance.read','finance.write'),
      ('expenditure_category','finance.read','finance.write'),
      ('expenditure','finance.read','finance.write'),
      ('budget','finance.read','finance.write'),
      ('budget_line','finance.read','finance.write'),
      ('momo_transaction','finance.read','finance.write'),
      ('financial_batch','finance.read','finance.write'),
      ('receipt','finance.read','finance.write')
    ) as t(tbl, rperm, wperm)
  loop
    perform beams_apply_confidential_rls(r.tbl, r.rperm, r.wperm);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Audit log — insert-only from the app context; readable with audit.read.
-- No UPDATE/DELETE policy exists → rows are immutable to normal clients.
-- ----------------------------------------------------------------------------
alter table activity_log enable row level security;
alter table activity_log force row level security;
create policy activity_log_select on activity_log for select using (
  assembly_id = auth_assembly_id() and auth_has_permission('audit.read')
);
create policy activity_log_insert on activity_log for insert with check (
  assembly_id = auth_assembly_id()
);

-- ----------------------------------------------------------------------------
-- Global reference tables (region/area/district/assembly) & RBAC catalog:
-- readable by any authenticated user; mutable only by super admin (service role
-- handles seeding/migrations, bypassing RLS).
-- ----------------------------------------------------------------------------
do $$
declare r text;
begin
  foreach r in array array['region','area','district','assembly','role','permission','role_permission','leadership_position']
  loop
    execute format('alter table %I enable row level security;', r);
    execute format($p$create policy %1$s_read on %1$I for select using (true);$p$, r);
    execute format($p$create policy %1$s_admin on %1$I for all
      using (auth_is_super_admin()) with check (auth_is_super_admin());$p$, r);
  end loop;
end $$;

-- app_user / user_assembly_role: a user reads self; super admin reads all.
alter table app_user enable row level security;
create policy app_user_self on app_user for select using (
  id = auth.uid() or auth_is_super_admin()
);
alter table user_assembly_role enable row level security;
create policy uar_read on user_assembly_role for select using (
  app_user_id = auth.uid() or auth_is_super_admin()
);

-- NOTE: the server-side SERVICE ROLE bypasses RLS for trusted operations
-- (migrations, cron sweeps, webhook ingestion) and re-applies tenant scoping in
-- the repository layer. It is never shipped to the browser.
