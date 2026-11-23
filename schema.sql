-- FloodBridge V1.1 — Supabase schema (run once in the Supabase SQL Editor)
-- Multi-user organisation model with roles. Row Level Security is enabled on every table.
--   admin  : manage members, rotate join code, read/write data
--   editor : read/write data (submit, verify, edit, delete)
--   viewer : read-only (default role for people who join with the code)

create extension if not exists pgcrypto;

create table if not exists public.fb_orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  join_code text not null unique default encode(gen_random_bytes(6), 'hex'),
  created_at timestamptz not null default now()
);

create table if not exists public.fb_memberships (
  org_id uuid not null references public.fb_orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('admin','editor','viewer')),
  email text,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- Record tables: the application record is stored in `data` (see docs/DATA-DICTIONARY.md).
do $$
declare t text;
begin
  foreach t in array array['fb_sites','fb_observations','fb_assets','fb_telemetry'] loop
    execute format($f$create table if not exists public.%I (
      id text primary key,
      org_id uuid not null references public.fb_orgs(id) on delete cascade,
      data jsonb not null,
      created_by uuid default auth.uid(),
      updated_at timestamptz not null default now()
    )$f$, t);
    execute format('create index if not exists %I on public.%I (org_id, updated_at desc)', t||'_org_time', t);
  end loop;
end $$;

-- Helper functions (security definer so policies do not recurse).
create or replace function public.fb_is_member(o uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from fb_memberships where org_id = o and user_id = auth.uid()) $$;

create or replace function public.fb_can_write(o uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from fb_memberships where org_id = o and user_id = auth.uid() and role in ('admin','editor')) $$;

create or replace function public.fb_is_admin(o uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from fb_memberships where org_id = o and user_id = auth.uid() and role = 'admin') $$;

-- RPCs used by the web app.
create or replace function public.fb_create_org(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare oid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if coalesce(trim(p_name),'') = '' then raise exception 'Organisation name required'; end if;
  insert into fb_orgs(name) values (trim(p_name)) returning id into oid;
  insert into fb_memberships(org_id, user_id, role, email) values (oid, auth.uid(), 'admin', auth.jwt()->>'email');
  return oid;
end $$;

create or replace function public.fb_join_org(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare oid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  select id into oid from fb_orgs where join_code = lower(trim(p_code));
  if oid is null then raise exception 'Invalid join code'; end if;
  insert into fb_memberships(org_id, user_id, role, email) values (oid, auth.uid(), 'viewer', auth.jwt()->>'email')
  on conflict (org_id, user_id) do nothing;
  return oid;
end $$;

create or replace function public.fb_rotate_code(p_org uuid) returns text
language plpgsql security definer set search_path = public as $$
declare c text := encode(gen_random_bytes(6), 'hex');
begin
  if not fb_is_admin(p_org) then raise exception 'Admin only'; end if;
  update fb_orgs set join_code = c where id = p_org;
  return c;
end $$;

revoke all on function public.fb_create_org(text), public.fb_join_org(text), public.fb_rotate_code(uuid) from public, anon;
grant execute on function public.fb_create_org(text), public.fb_join_org(text), public.fb_rotate_code(uuid) to authenticated;

-- Row Level Security
alter table public.fb_orgs enable row level security;
alter table public.fb_memberships enable row level security;
drop policy if exists fb_orgs_select on public.fb_orgs;
create policy fb_orgs_select on public.fb_orgs for select to authenticated using (public.fb_is_member(id));
drop policy if exists fb_orgs_update on public.fb_orgs;
create policy fb_orgs_update on public.fb_orgs for update to authenticated using (public.fb_is_admin(id)) with check (public.fb_is_admin(id));
drop policy if exists fb_mem_select on public.fb_memberships;
create policy fb_mem_select on public.fb_memberships for select to authenticated using (public.fb_is_member(org_id));
drop policy if exists fb_mem_update on public.fb_memberships;
create policy fb_mem_update on public.fb_memberships for update to authenticated using (public.fb_is_admin(org_id) and user_id <> auth.uid()) with check (public.fb_is_admin(org_id));
drop policy if exists fb_mem_delete on public.fb_memberships;
create policy fb_mem_delete on public.fb_memberships for delete to authenticated using ((public.fb_is_admin(org_id) and user_id <> auth.uid()) or user_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['fb_sites','fb_observations','fb_assets','fb_telemetry'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%1$s_read" on public.%1$I', t);
    execute format('create policy "%1$s_read" on public.%1$I for select to authenticated using (public.fb_is_member(org_id))', t);
    execute format('drop policy if exists "%1$s_ins" on public.%1$I', t);
    execute format('create policy "%1$s_ins" on public.%1$I for insert to authenticated with check (public.fb_can_write(org_id))', t);
    execute format('drop policy if exists "%1$s_upd" on public.%1$I', t);
    execute format('create policy "%1$s_upd" on public.%1$I for update to authenticated using (public.fb_can_write(org_id)) with check (public.fb_can_write(org_id))', t);
    execute format('drop policy if exists "%1$s_del" on public.%1$I', t);
    execute format('create policy "%1$s_del" on public.%1$I for delete to authenticated using (public.fb_can_write(org_id))', t);
  end loop;
end $$;

-- Realtime: other users see new reports immediately.
alter publication supabase_realtime add table public.fb_sites;
alter publication supabase_realtime add table public.fb_observations;
alter publication supabase_realtime add table public.fb_assets;
alter publication supabase_realtime add table public.fb_telemetry;
