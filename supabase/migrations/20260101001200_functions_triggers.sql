-- ============================================================================
-- BEAMS · 95 · Shared functions & triggers
-- Depends on: all table files (00–88).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- set_updated_at() — keep updated_at current on every UPDATE.
-- Applied to every table that has an updated_at column.
-- ----------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger
  language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare r record;
begin
  for r in
    select c.table_name
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.column_name = 'updated_at'
  loop
    execute format(
      'create trigger trg_%1$s_updated_at before update on %1$I
       for each row execute function set_updated_at();', r.table_name);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- next_number() — atomic human-friendly sequence per (assembly, scope).
-- Used for receipt numbers, counselling/welfare case numbers, etc.
-- ----------------------------------------------------------------------------
create or replace function next_number(p_assembly uuid, p_scope text)
  returns text language plpgsql as $$
declare v_prefix text; v_val bigint;
begin
  update numbering_sequence
     set next_value = next_value + 1, updated_at = now()
   where assembly_id = p_assembly and scope = p_scope
   returning prefix, next_value - 1 into v_prefix, v_val;

  if not found then
    insert into numbering_sequence(assembly_id, scope, next_value)
    values (p_assembly, p_scope, 2)
    returning prefix, 1 into v_prefix, v_val;
  end if;

  return coalesce(v_prefix, '') || lpad(v_val::text, 5, '0');
end;
$$;

-- ----------------------------------------------------------------------------
-- log_activity() — write an audit row. Called by the repository layer AND by
-- triggers on the most sensitive tables so a mutation can never skip the trail.
-- ----------------------------------------------------------------------------
create or replace function log_activity() returns trigger
  language plpgsql security definer as $$
declare v_assembly uuid;
begin
  v_assembly := coalesce(
    (case when tg_op = 'DELETE' then old.assembly_id else new.assembly_id end),
    auth_assembly_id()
  );
  insert into activity_log(
    assembly_id, actor_user_id, action, entity_type, entity_id,
    before_data, after_data)
  values (
    v_assembly, auth.uid(), lower(tg_op), tg_table_name,
    coalesce(new.id, old.id),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

-- Attach mandatory audit triggers to confidential/audit-critical tables.
do $$
declare r text;
begin
  foreach r in array array[
    'contribution','expenditure','momo_transaction','pledge','receipt',
    'counselling_case','counselling_session','counselling_note',
    'welfare_case','welfare_disbursement',
    'member','role_permission','user_assembly_role','integration_credential'
  ]
  loop
    execute format(
      'create trigger trg_%1$s_audit
       after insert or update or delete on %1$I
       for each row execute function log_activity();', r);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Data-integrity guard: prevent overlapping event sessions in the same place.
-- (Illustrative use of btree_gist exclusion constraints.)
-- ----------------------------------------------------------------------------
-- alter table event_session
--   add constraint no_overlapping_sessions
--   exclude using gist (
--     event_id with =,
--     tstzrange(starts_at, coalesce(ends_at, starts_at + interval '2 hours')) with &&
--   );

-- ----------------------------------------------------------------------------
-- Convenience VIEW: active (non-deleted) members with cell & status.
-- The repository layer prefers views like this so soft-delete + common joins
-- are centralized. (One example; more live with each module.)
-- ----------------------------------------------------------------------------
create or replace view v_active_member as
  select m.*, hc.name as home_cell_name
  from member m
  left join home_cell hc on hc.id = m.home_cell_id
  where m.deleted_at is null;
