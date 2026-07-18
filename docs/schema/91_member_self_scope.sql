-- ============================================================================
-- BEAMS · 91 · Member self-service row scoping (refines 90 standard policies)
-- Depends on: 90_rls_policies.sql, 96_seed_rbac.sql
--
-- WHY: the standard SELECT policy grants any tenant user read of tenant rows —
-- right for staff, wrong for the `member` role. Postgres permissive policies are
-- OR-combined, so we REPLACE the SELECT policy on member-facing tables with:
--   assembly = active AND ( holds broad *.read  OR  row belongs to me ).
-- The member role holds no broad *.read perms, so it falls through to self-scope.
-- ============================================================================

-- Current user's linked member_id (from JWT app_metadata).
create or replace function auth_member_id() returns uuid
  language sql stable as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'member_id', '')::uuid;
$$;

-- member: own record + members in my family.
drop policy if exists member_select on member;
create policy member_select on member for select using (
  assembly_id = auth_assembly_id() and (
    auth_has_permission('member.read')
    or id = auth_member_id()
    or exists (
      select 1 from family_member fm_self
      join family_member fm_row on fm_row.family_id = fm_self.family_id
      where fm_self.member_id = auth_member_id()
        and fm_row.member_id = member.id
    )
  )
);

-- member_contact / member_note-like child rows: gated by parent visibility.
drop policy if exists member_contact_select on member_contact;
create policy member_contact_select on member_contact for select using (
  assembly_id = auth_assembly_id() and (
    auth_has_permission('member.read') or member_id = auth_member_id()
  )
);

-- family: families I belong to.
drop policy if exists family_select on family;
create policy family_select on family for select using (
  assembly_id = auth_assembly_id() and (
    auth_has_permission('family.read')
    or exists (
      select 1 from family_member fm
      where fm.family_id = family.id and fm.member_id = auth_member_id()
    )
  )
);

-- contribution: my own giving history only (unless finance.read).
drop policy if exists contribution_select on contribution;
create policy contribution_select on contribution for select using (
  assembly_id = auth_assembly_id() and (
    auth_has_permission('finance.read') or member_id = auth_member_id()
  )
);

-- prayer_request: mine + the public prayer wall (unless prayer.read).
drop policy if exists prayer_request_select on prayer_request;
create policy prayer_request_select on prayer_request for select using (
  assembly_id = auth_assembly_id() and (
    auth_has_permission('prayer.read')
    or member_id = auth_member_id()
    or privacy = 'public'
  )
);

-- event_registration: my own registrations (unless event.read).
drop policy if exists event_registration_select on event_registration;
create policy event_registration_select on event_registration for select using (
  assembly_id = auth_assembly_id() and (
    auth_has_permission('event.read') or member_id = auth_member_id()
  )
);

-- Members may INSERT their own prayer requests / event registrations even though
-- they lack the broad write perm: add self-write policies.
drop policy if exists prayer_request_insert on prayer_request;  -- standard replaced
create policy prayer_request_insert on prayer_request for insert with check (
  assembly_id = auth_assembly_id() and (
    auth_has_permission('prayer.write') or member_id = auth_member_id()
  )
);

create policy event_registration_self_insert on event_registration for insert with check (
  assembly_id = auth_assembly_id() and (
    auth_has_permission('event.write') or member_id = auth_member_id()
  )
);

-- NOTE: staff roles hold the broad *.read/*.write permissions, so their access is
-- unchanged. Only the self-service `member` role is narrowed by these policies.
