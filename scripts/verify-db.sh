#!/usr/bin/env bash
# ============================================================================
# BEAMS · verify-db.sh — prove the schema + RLS + seed compile against a real
# Postgres, retiring the "not yet run against Postgres" caveat (docs/15 §4).
#
# Requires: Docker + Supabase CLI (`brew install supabase/tap/supabase`).
# Usage:    ./scripts/verify-db.sh
# ============================================================================
set -euo pipefail

command -v supabase >/dev/null || { echo "❌ Supabase CLI not found. Install: brew install supabase/tap/supabase"; exit 1; }
docker info >/dev/null 2>&1 || { echo "❌ Docker is not running. Start Docker Desktop and retry."; exit 1; }

echo "▶ Starting local Supabase (Postgres 15 + Auth + Storage)…"
supabase start

echo "▶ Applying ALL migrations + seed (fails loudly on any DDL/RLS error)…"
supabase db reset --no-seed=false

echo "▶ Sanity counts…"
supabase db execute --sql "
  select 'tables' as what, count(*) from information_schema.tables where table_schema='public'
  union all select 'rls_enabled', count(*) from pg_tables where schemaname='public' and rowsecurity
  union all select 'policies', count(*) from pg_policies where schemaname='public'
  union all select 'roles_seeded', count(*) from role
  union all select 'permissions_seeded', count(*) from permission
  union all select 'assemblies', count(*) from assembly;
"

echo "▶ Generating TypeScript types from the live schema…"
supabase gen types typescript --local > src/shared/types/database.types.ts
echo "✅ Types written to src/shared/types/database.types.ts"

echo "▶ Running the RLS isolation suite against local Supabase…"
TEST_SUPABASE_URL="$(supabase status -o json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).API_URL))')" \
TEST_ANON_KEY="$(supabase status -o json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).ANON_KEY))')" \
TEST_SERVICE_KEY="$(supabase status -o json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).SERVICE_ROLE_KEY))')" \
  npm test

echo "🎉 Database verification complete. Schema, RLS, and seed all apply cleanly."
