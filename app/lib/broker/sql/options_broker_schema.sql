-- Phase O1 — Alpaca options broker-truth schema scaffold
-- Run this once in Supabase before enabling live broker-backed options execution.

-- ---------------------------------------------------------------------------
-- 1. Existing broker truth tables: extend for options-aware sync
-- ---------------------------------------------------------------------------

alter table if exists public.broker_accounts
  add column if not exists options_buying_power numeric,
  add column if not exists options_approved_level integer,
  add column if not exists options_trading_level integer;

alter table if exists public.broker_positions
  add column if not exists asset_class text default 'us_equity',
  add column if not exists option_symbol text,
  add column if not exists underlying_symbol text,
  add column if not exists expiration_date date,
  add column if not exists strike_price numeric(12, 3),
  add column if not exists option_type text,
  add column if not exists multiplier integer default 1;

create index if not exists broker_positions_user_asset_class_idx
  on public.broker_positions(user_id, broker, is_paper, asset_class);

alter table if exists public.broker_orders
  add column if not exists asset_class text default 'us_equity',
  add column if not exists option_symbol text,
  add column if not exists underlying_symbol text,
  add column if not exists expiration_date date,
  add column if not exists strike_price numeric(12, 3),
  add column if not exists option_type text,
  add column if not exists multiplier integer default 1,
  add column if not exists order_class text,
  add column if not exists position_intent text,
  add column if not exists limit_price numeric(18, 6),
  add column if not exists notional numeric(18, 6),
  add column if not exists legs_json jsonb,
  add column if not exists execution_mode_snapshot text,
  add column if not exists option_trade_id uuid;

create index if not exists broker_orders_user_asset_class_idx
  on public.broker_orders(user_id, broker, asset_class, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. Existing options trade table: add broker execution lifecycle columns
-- ---------------------------------------------------------------------------

alter table if exists public.option_paper_trades
  add column if not exists qty_contracts integer not null default 1,
  add column if not exists execution_mode_snapshot text default 'paper',
  add column if not exists broker_status text,
  add column if not exists entry_broker_order_id text,
  add column if not exists exit_broker_order_id text,
  add column if not exists close_requested_at timestamptz;

create index if not exists option_paper_trades_broker_status_idx
  on public.option_paper_trades(status, broker_status, user_id);

-- ---------------------------------------------------------------------------
-- 3. New option execution/audit tables
-- ---------------------------------------------------------------------------

create table if not exists public.option_order_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  trade_id uuid not null references public.option_paper_trades(id) on delete cascade,
  broker text not null default 'alpaca',
  broker_account_id uuid null,
  action text not null,
  trigger_source text not null default 'options-cycle',
  execution_mode text not null,
  status text not null,
  reason text null,
  idempotency_key text not null unique,
  broker_order_id text null,
  request_payload jsonb null,
  response_payload jsonb null,
  error_message text null,
  created_at timestamptz not null default now(),
  submitted_at timestamptz null,
  reconciled_at timestamptz null
);

create index if not exists option_order_runs_trade_idx
  on public.option_order_runs(trade_id, created_at desc);

create index if not exists option_order_runs_user_status_idx
  on public.option_order_runs(user_id, status, created_at desc);

create table if not exists public.option_trade_orders (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.option_paper_trades(id) on delete cascade,
  broker text not null default 'alpaca',
  broker_order_id text not null,
  client_order_id text null,
  order_role text not null,
  order_class text null,
  position_intent text null,
  option_symbol text not null,
  underlying_symbol text null,
  side text not null,
  qty numeric(18, 6) not null,
  status text null,
  filled_qty numeric(18, 6) null,
  filled_avg_price numeric(18, 6) null,
  submitted_at timestamptz null,
  filled_at timestamptz null,
  raw_order jsonb null,
  created_at timestamptz not null default now()
);

create unique index if not exists option_trade_orders_broker_order_id_uq
  on public.option_trade_orders(broker_order_id);

create index if not exists option_trade_orders_trade_idx
  on public.option_trade_orders(trade_id, created_at desc);

create table if not exists public.option_position_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  trade_id uuid null references public.option_paper_trades(id) on delete set null,
  broker text not null default 'alpaca',
  broker_activity_id text not null unique,
  activity_type text not null,
  symbol text not null,
  underlying_symbol text null,
  qty numeric(18, 6) null,
  price numeric(18, 6) null,
  net_amount numeric(18, 6) null,
  status text null,
  occurred_at timestamptz null,
  raw_event jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists option_position_events_user_occurred_idx
  on public.option_position_events(user_id, occurred_at desc);

create index if not exists option_position_events_trade_idx
  on public.option_position_events(trade_id, created_at desc);