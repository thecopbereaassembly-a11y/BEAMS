-- ============================================================================
-- BEAMS · 00 · Extensions & Enumerated Types
-- Runs first. All later schema files assume these exist.
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";
create extension if not exists "unaccent";
create extension if not exists "btree_gist";
create extension if not exists "citext";

-- ---- Enumerated types (stable sets; configurable sets are lookup tables) ----
create type gender               as enum ('male','female');
create type marital_status       as enum ('single','married','divorced','widowed','separated');
create type member_state         as enum ('visitor','new_convert','member','inactive','transferred_out','deceased');
create type baptism_type         as enum ('water','holy_spirit');
create type attendance_status    as enum ('present','absent','excused','late');
create type session_status       as enum ('scheduled','open','closed','cancelled');
create type followup_status      as enum ('open','in_progress','completed','cancelled');
create type followup_priority    as enum ('low','normal','high','urgent');
create type case_status          as enum ('open','in_progress','on_hold','closed');
create type privacy_level        as enum ('public','leaders_only','private');
create type contribution_channel as enum ('momo','cash','bank','cheque','card','other');
create type momo_network         as enum ('mtn','telecel','airteltigo');
create type txn_status           as enum ('pending','successful','failed','reversed','reconciled');
create type message_channel      as enum ('sms','email','whatsapp','in_app');
create type delivery_status      as enum ('queued','sent','delivered','failed','undelivered');
create type consent_status       as enum ('opted_in','opted_out','unknown');
create type doc_visibility       as enum ('private','leaders','assembly');
create type asset_condition      as enum ('new','good','fair','poor','damaged','disposed');
create type report_format        as enum ('pdf','excel','csv','print');
create type job_status           as enum ('queued','running','succeeded','failed');
