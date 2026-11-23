-- FloodBridge V2 Institutional Edition
-- Run AFTER supabase/schema.sql. Safe to re-run.
create extension if not exists pgcrypto;

create table if not exists public.fb_org_profiles (
  org_id uuid primary key references public.fb_orgs(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.fb_channels (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.fb_orgs(id) on delete cascade,
  channel_key text not null check (channel_key in ('ussd','email','meta','notify','social_bridge')),
  provider text not null,
  config jsonb not null default '{}'::jsonb,
  enabled boolean not null default false,
  status text not null default 'pending' check (status in ('pending','ready','error','disabled')),
  last_tested_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  unique(org_id, channel_key)
);

create table if not exists public.fb_incidents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.fb_orgs(id) on delete cascade,
  incident_ref text not null,
  channel text not null check (channel in ('website','ussd','email','sms','whatsapp','facebook','instagram','x','social_webhook','sensor','staff','other')),
  category text not null default 'other',
  severity text not null default 'unknown' check (severity in ('unknown','low','moderate','medium','high','critical','life-threatening')),
  location_text text,
  latitude double precision,
  longitude double precision,
  description text not null,
  reporter_name text,
  reporter_contact text,
  status text not null default 'new' check (status in ('new','acknowledged','in_progress','resolved','closed','rejected')),
  verification_status text not null default 'unverified' check (verification_status in ('unverified','verified','rejected','needs_information')),
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  assigned_to uuid references auth.users(id) on delete set null,
  ai_triage jsonb,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(org_id, incident_ref)
);
create index if not exists fb_incidents_org_recent on public.fb_incidents(org_id, created_at desc);
create index if not exists fb_incidents_org_status on public.fb_incidents(org_id, status, severity);
create index if not exists fb_incidents_geo on public.fb_incidents using gist (point(longitude, latitude)) where latitude is not null and longitude is not null;

create table if not exists public.fb_response_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.fb_orgs(id) on delete cascade,
  incident_id uuid references public.fb_incidents(id) on delete set null,
  title text not null,
  assigned_team text,
  assigned_user uuid references auth.users(id) on delete set null,
  priority text not null default 'normal' check (priority in ('normal','high','urgent')),
  due_at timestamptz,
  status text not null default 'assigned' check (status in ('assigned','accepted','in_progress','blocked','completed','cancelled')),
  notes text,
  outcome text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists fb_response_tasks_org_recent on public.fb_response_tasks(org_id, created_at desc);

create table if not exists public.fb_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.fb_orgs(id) on delete cascade,
  direction text not null check (direction in ('inbound','outbound')),
  channel text not null,
  provider_message_id text,
  sender text,
  recipient text,
  subject text,
  body_preview text,
  delivery_status text not null default 'received',
  incident_id uuid references public.fb_incidents(id) on delete set null,
  provider_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists fb_messages_org_recent on public.fb_messages(org_id, created_at desc);

create table if not exists public.fb_audit_log (
  id bigserial primary key,
  org_id uuid not null references public.fb_orgs(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity text not null,
  record_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists fb_audit_log_org_recent on public.fb_audit_log(org_id, created_at desc);

-- Server-side public intake rate limiting. Only service-role Edge Functions can call the RPC.
create table if not exists public.fb_public_rate_limits (
  ip_hash text primary key,
  window_started_at timestamptz not null,
  hit_count integer not null default 0
);
alter table public.fb_public_rate_limits enable row level security;

create or replace function public.fb_allow_public_intake(p_ip_hash text, p_limit integer default 8, p_window_seconds integer default 3600)
returns boolean
language plpgsql security definer set search_path = public as $$
declare current_row fb_public_rate_limits%rowtype;
begin
  insert into fb_public_rate_limits(ip_hash, window_started_at, hit_count)
  values (p_ip_hash, now(), 1)
  on conflict (ip_hash) do nothing;
  select * into current_row from fb_public_rate_limits where ip_hash = p_ip_hash for update;
  if current_row.window_started_at < now() - make_interval(secs => greatest(60, p_window_seconds)) then
    update fb_public_rate_limits set window_started_at = now(), hit_count = 1 where ip_hash = p_ip_hash;
    return true;
  end if;
  if current_row.hit_count >= greatest(1, p_limit) then return false; end if;
  update fb_public_rate_limits set hit_count = hit_count + 1 where ip_hash = p_ip_hash;
  return true;
end $$;
revoke all on function public.fb_allow_public_intake(text, integer, integer) from public, anon, authenticated;
grant execute on function public.fb_allow_public_intake(text, integer, integer) to service_role;

-- Audit every institutional incident/task mutation. The source payload is not copied into the log.
create or replace function public.fb_audit_mutation() returns trigger
language plpgsql security definer set search_path = public as $$
declare row_json jsonb; oid uuid; rid text; act text;
begin
  if TG_OP = 'DELETE' then row_json := to_jsonb(old); act := 'delete';
  elsif TG_OP = 'INSERT' then row_json := to_jsonb(new); act := 'create';
  else row_json := to_jsonb(new); act := 'update'; end if;
  oid := (row_json->>'org_id')::uuid;
  rid := coalesce(row_json->>'id', row_json->>'org_id');
  insert into public.fb_audit_log(org_id, actor_id, action, entity, record_id, details)
  values (oid, auth.uid(), act, TG_TABLE_NAME, rid, jsonb_build_object('at', now()));
  if TG_OP = 'DELETE' then return old; else return new; end if;
end $$;
drop trigger if exists fb_incidents_audit on public.fb_incidents;
create trigger fb_incidents_audit after insert or update or delete on public.fb_incidents for each row execute function public.fb_audit_mutation();
drop trigger if exists fb_tasks_audit on public.fb_response_tasks;
create trigger fb_tasks_audit after insert or update or delete on public.fb_response_tasks for each row execute function public.fb_audit_mutation();
drop trigger if exists fb_profiles_audit on public.fb_org_profiles;
create trigger fb_profiles_audit after insert or update or delete on public.fb_org_profiles for each row execute function public.fb_audit_mutation();
drop trigger if exists fb_channels_audit on public.fb_channels;
create trigger fb_channels_audit after insert or update or delete on public.fb_channels for each row execute function public.fb_audit_mutation();

-- RLS policies. Organization admins control integrations; editors can manage incidents/tasks.
alter table public.fb_org_profiles enable row level security;
alter table public.fb_channels enable row level security;
alter table public.fb_incidents enable row level security;
alter table public.fb_response_tasks enable row level security;
alter table public.fb_messages enable row level security;
alter table public.fb_audit_log enable row level security;

-- API privileges are broad enough for PostgREST to reach the tables; RLS below is the actual access boundary.
grant select, insert, update, delete on public.fb_org_profiles, public.fb_channels, public.fb_incidents, public.fb_response_tasks, public.fb_messages to authenticated;
grant select on public.fb_audit_log to authenticated;
grant all on public.fb_org_profiles, public.fb_channels, public.fb_incidents, public.fb_response_tasks, public.fb_messages, public.fb_audit_log, public.fb_public_rate_limits to service_role;
grant usage, select on sequence public.fb_audit_log_id_seq to service_role;

drop policy if exists fb_profiles_read on public.fb_org_profiles;
create policy fb_profiles_read on public.fb_org_profiles for select to authenticated using (public.fb_is_member(org_id));
drop policy if exists fb_profiles_admin_write on public.fb_org_profiles;
create policy fb_profiles_admin_write on public.fb_org_profiles for all to authenticated using (public.fb_is_admin(org_id)) with check (public.fb_is_admin(org_id));

drop policy if exists fb_channels_read on public.fb_channels;
create policy fb_channels_read on public.fb_channels for select to authenticated using (public.fb_is_member(org_id));
drop policy if exists fb_channels_admin_write on public.fb_channels;
create policy fb_channels_admin_write on public.fb_channels for all to authenticated using (public.fb_is_admin(org_id)) with check (public.fb_is_admin(org_id));

drop policy if exists fb_incidents_read on public.fb_incidents;
create policy fb_incidents_read on public.fb_incidents for select to authenticated using (public.fb_is_member(org_id));
drop policy if exists fb_incidents_insert on public.fb_incidents;
create policy fb_incidents_insert on public.fb_incidents for insert to authenticated with check (public.fb_can_write(org_id));
drop policy if exists fb_incidents_update on public.fb_incidents;
create policy fb_incidents_update on public.fb_incidents for update to authenticated using (public.fb_can_write(org_id)) with check (public.fb_can_write(org_id));
drop policy if exists fb_incidents_delete on public.fb_incidents;
create policy fb_incidents_delete on public.fb_incidents for delete to authenticated using (public.fb_is_admin(org_id));

drop policy if exists fb_tasks_read on public.fb_response_tasks;
create policy fb_tasks_read on public.fb_response_tasks for select to authenticated using (public.fb_is_member(org_id));
drop policy if exists fb_tasks_insert on public.fb_response_tasks;
create policy fb_tasks_insert on public.fb_response_tasks for insert to authenticated with check (public.fb_can_write(org_id));
drop policy if exists fb_tasks_update on public.fb_response_tasks;
create policy fb_tasks_update on public.fb_response_tasks for update to authenticated using (public.fb_can_write(org_id)) with check (public.fb_can_write(org_id));
drop policy if exists fb_tasks_delete on public.fb_response_tasks;
create policy fb_tasks_delete on public.fb_response_tasks for delete to authenticated using (public.fb_is_admin(org_id));

drop policy if exists fb_messages_read on public.fb_messages;
create policy fb_messages_read on public.fb_messages for select to authenticated using (public.fb_is_member(org_id));
drop policy if exists fb_messages_write on public.fb_messages;
create policy fb_messages_write on public.fb_messages for insert to authenticated with check (public.fb_can_write(org_id));

drop policy if exists fb_audit_read on public.fb_audit_log;
create policy fb_audit_read on public.fb_audit_log for select to authenticated using (public.fb_is_admin(org_id));

-- Add new operational tables to Supabase Realtime only when not already present.
do $$
declare t text;
begin
  foreach t in array array['fb_incidents','fb_response_tasks','fb_messages'] loop
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
