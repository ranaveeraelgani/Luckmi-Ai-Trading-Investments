-- Migration: add auto-entry columns to option_preferences
-- Run once against your Supabase project (SQL editor or migration tool).

alter table option_preferences
  add column if not exists auto_entry_enabled        boolean not null default false,
  add column if not exists auto_entry_max_positions  integer not null default 3
    check (auto_entry_max_positions between 1 and 15);

comment on column option_preferences.auto_entry_enabled is
  'When true, the options-auto-entry cron will place trades for this user automatically.';

comment on column option_preferences.auto_entry_max_positions is
  'How many positions the auto-entry cron may open per cycle (1-15). Bounded also by max_open_positions.';
