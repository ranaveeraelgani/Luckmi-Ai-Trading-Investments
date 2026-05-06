-- Migration: add options-specific columns to ai_decisions
-- Run once against your Supabase project (SQL editor or migration tool).
-- Fully backward-compatible: new columns are nullable; existing stock-based rows are unaffected.

alter table ai_decisions
  add column if not exists option_trade_id  uuid    references option_paper_trades(id) on delete set null,
  add column if not exists option_strategy  text,      -- e.g. 'call_debit_spread'
  add column if not exists option_direction text,      -- 'bullish' | 'bearish'
  add column if not exists ocs_score        integer,   -- Options Conviction Score at time of entry
  add column if not exists risk_flags       jsonb;     -- array of short risk-flag strings

-- Index for lookups by option trade
create index if not exists ai_decisions_option_trade_id_idx
  on ai_decisions (option_trade_id)
  where option_trade_id is not null;

comment on column ai_decisions.option_trade_id  is 'Links an AI decision to an options trade row in option_paper_trades.';
comment on column ai_decisions.option_strategy  is 'Options strategy at the time of the AI decision.';
comment on column ai_decisions.option_direction is 'Bullish or bearish direction assessed by AI.';
comment on column ai_decisions.ocs_score        is 'Deterministic Options Conviction Score at entry (0-100).';
comment on column ai_decisions.risk_flags       is 'JSON array of short risk-flag strings returned by AI.';
