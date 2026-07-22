-- ============================================================================
-- BEAMS · 97 · Custom Access Token Hook — stamps tenant + role claims into JWTs
-- Depends on: 10 (app_user, user_assembly_role, role), 90 (RLS helpers)
--
-- THIS IS THE KEYSTONE OF AUTHORIZATION. Every RLS policy resolves the caller's
-- assembly from `auth.jwt() -> 'app_metadata' ->> 'assembly_id'`. Without this
-- hook that claim is absent, auth_assembly_id() returns NULL, and a user sees
-- nothing. See docs/08-auth-and-security.md §2.
--
-- After applying, the hook MUST be enabled in the Supabase dashboard:
--   Authentication → Hooks → "Customize Access Token (JWT) Claims"
--   → select public.custom_access_token_hook
-- ============================================================================

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer                      -- runs as owner (postgres) → bypasses RLS
set search_path = public, pg_temp
as $$
declare
  v_user_id   uuid;
  v_member_id uuid;
  v_is_super  boolean;
  v_assembly  uuid;
  v_roles     text[];
  v_assemblies uuid[];
  claims      jsonb;
begin
  v_user_id := (event ->> 'user_id')::uuid;

  -- Profile flags
  select au.member_id, coalesce(au.is_super_admin, false)
    into v_member_id, v_is_super
  from app_user au
  where au.id = v_user_id and au.is_active and au.deleted_at is null;

  -- Active assembly: the primary one, else the earliest active assignment.
  select uar.assembly_id
    into v_assembly
  from user_assembly_role uar
  where uar.app_user_id = v_user_id
    and uar.is_active
    and uar.deleted_at is null
  order by uar.is_primary desc, uar.created_at asc
  limit 1;

  -- Every assembly this user may switch into.
  select array_agg(distinct uar.assembly_id)
    into v_assemblies
  from user_assembly_role uar
  where uar.app_user_id = v_user_id
    and uar.is_active
    and uar.deleted_at is null;

  -- Role keys held IN the active assembly.
  select array_agg(distinct r.key)
    into v_roles
  from user_assembly_role uar
  join role r on r.id = uar.role_id
  where uar.app_user_id = v_user_id
    and uar.assembly_id = v_assembly
    and uar.is_active
    and uar.deleted_at is null;

  claims := coalesce(event -> 'claims', '{}'::jsonb);

  claims := jsonb_set(
    claims,
    '{app_metadata}',
    coalesce(claims -> 'app_metadata', '{}'::jsonb) || jsonb_build_object(
      'assembly_id',    to_jsonb(v_assembly),
      'assembly_ids',   coalesce(to_jsonb(v_assemblies), '[]'::jsonb),
      'member_id',      to_jsonb(v_member_id),
      'role_keys',      coalesce(to_jsonb(v_roles), '[]'::jsonb),
      'is_super_admin', to_jsonb(coalesce(v_is_super, false))
    )
  );

  -- NOTE: permissions are deliberately NOT baked into the token. They are
  -- resolved live from role_permission on every request, so an admin's
  -- permission change takes effect immediately (docs/09 §5).

  return jsonb_set(event, '{claims}', claims);
end;
$$;

-- Only the auth service may execute the hook.
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

-- ----------------------------------------------------------------------------
-- Assembly switching: re-point the user's primary assembly. The next token
-- mint (refresh) picks it up via the hook above. Callable by the user for
-- assemblies they already belong to (docs/13 §A1).
-- ----------------------------------------------------------------------------
create or replace function public.switch_assembly(target_assembly uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from user_assembly_role
    where app_user_id = auth.uid()
      and assembly_id = target_assembly
      and is_active and deleted_at is null
  ) then
    raise exception 'Not a member of that assembly';
  end if;

  update user_assembly_role
     set is_primary = (assembly_id = target_assembly)
   where app_user_id = auth.uid();
end;
$$;

grant execute on function public.switch_assembly(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Effective permissions for the current user, resolved live from the matrix.
-- The app calls this once per request to build its AuthContext (docs/08 §4).
-- Mirrors auth_has_permission() but returns the whole set.
-- ----------------------------------------------------------------------------
create or replace function public.my_permissions()
returns table (permission_key text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select distinct p.key
  from user_assembly_role uar
  join role_permission rp on rp.role_id = uar.role_id
  join permission p       on p.id = rp.permission_id
  where uar.app_user_id = auth.uid()
    and uar.assembly_id = auth_assembly_id()
    and uar.is_active
    and uar.deleted_at is null
    and rp.is_granted
    and (rp.assembly_id = auth_assembly_id() or rp.assembly_id is null)
  union
  -- super admins hold everything
  select p.key from permission p
  where exists (
    select 1 from app_user au
    where au.id = auth.uid() and au.is_super_admin and au.is_active
  );
$$;

grant execute on function public.my_permissions() to authenticated;
