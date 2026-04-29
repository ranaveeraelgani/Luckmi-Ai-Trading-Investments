-- Run this in Supabase SQL editor (DB-first workflow).
-- It is idempotent and safe to re-run.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'notification_event_status'
  ) then
    create type notification_event_status as enum ('pending', 'processing', 'sent', 'failed');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'notification_event_type'
  ) then
    create type notification_event_type as enum (
      'trade_filled',
      'trade_skipped_safety',
      'broker_sync_failed',
      'engine_cycle_completed',
      'score_alert',
      'daily_summary'
    );
  end if;
end $$;

create table if not exists public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  trade_alerts boolean not null default true,
  score_alerts boolean not null default true,
  broker_alerts boolean not null default true,
  daily_summary boolean not null default true,
  marketing_alerts boolean not null default false,
  critical_only boolean not null default false,
  quiet_hours_start time,
  quiet_hours_end time,
  timezone text not null default 'America/Chicago',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id)
);

create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  type notification_event_type not null,
  title text not null,
  body text not null,
  url text,
  status notification_event_status not null default 'pending',
  provider text,
  provider_message_id text,
  error_message text,
  metadata jsonb,
  idempotency_key text not null,
  attempts integer not null default 0,
  retry_count integer not null default 0,
  last_attempt_at timestamptz,
  next_retry_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(user_id, idempotency_key)
);

alter table public.notification_events
  add column if not exists read_at timestamptz;

create index if not exists idx_notification_events_status_next_retry
  on public.notification_events(status, next_retry_at);

create index if not exists idx_notification_events_user_created
  on public.notification_events(user_id, created_at desc);

create index if not exists idx_notification_events_type_created
  on public.notification_events(type, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_notification_preferences_updated_at on public.notification_preferences;
create trigger trg_notification_preferences_updated_at
before update on public.notification_preferences
for each row
execute procedure public.set_updated_at();

drop trigger if exists trg_notification_events_updated_at on public.notification_events;
create trigger trg_notification_events_updated_at
before update on public.notification_events
for each row
execute procedure public.set_updated_at();

alter table public.notification_preferences enable row level security;
alter table public.notification_events enable row level security;

drop policy if exists notification_preferences_select_own on public.notification_preferences;
create policy notification_preferences_select_own
on public.notification_preferences
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists notification_preferences_insert_own on public.notification_preferences;
create policy notification_preferences_insert_own
on public.notification_preferences
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists notification_preferences_update_own on public.notification_preferences;
create policy notification_preferences_update_own
on public.notification_preferences
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists notification_events_select_own on public.notification_events;
create policy notification_events_select_own
on public.notification_events
for select
to authenticated
using (auth.uid() = user_id);

-- App server (service role) can insert/update regardless of RLS.

create or replace function public.claim_notification_events(
  p_limit integer default 50,
  p_now timestamptz default now()
)
returns setof public.notification_events
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with picked as (
    select e.id
    from public.notification_events e
    where e.status = 'pending'
      and (e.next_retry_at is null or e.next_retry_at <= p_now)
    order by e.created_at asc
    limit greatest(1, least(p_limit, 500))
    for update skip locked
  ),
  updated as (
    update public.notification_events e
    set
      status = 'processing',
      attempts = e.attempts + 1,
      last_attempt_at = p_now,
      updated_at = p_now
    where e.id in (select id from picked)
    returning e.*
  )
  select * from updated;
end;
$$;

revoke all on function public.claim_notification_events(integer, timestamptz) from public;
grant execute on function public.claim_notification_events(integer, timestamptz) to authenticated, service_role;
