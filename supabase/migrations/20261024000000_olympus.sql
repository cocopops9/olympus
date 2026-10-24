-- Olympus on Supabase: the store behind the `olympus` Edge Function (supabase/functions/olympus).
-- A private schema: the REST API never exposes it, and row level security is on with no policy,
-- so the publishable key reaches nothing here. Only the function's own database connection does.
create schema if not exists olympus;
revoke all on schema olympus from anon, authenticated;

create table if not exists olympus.docs (
  key text primary key,
  doc jsonb not null default 'null'::jsonb,
  updated_at timestamptz not null default now()
);
alter table olympus.docs enable row level security;

create table if not exists olympus.photos (
  name text primary key,
  type text not null,
  bytes bytea not null,
  created_at timestamptz not null default now()
);
alter table olympus.photos enable row level security;

revoke all on all tables in schema olympus from anon, authenticated;
