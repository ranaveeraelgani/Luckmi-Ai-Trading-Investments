-- Run in Supabase SQL editor to schedule pending notification dispatch.
-- Update URL and Bearer token values for your environment.

select cron.schedule(
  'luckmi-notifications-dispatch-every-5-min',
  '*/5 * * * *',
  $$
  select net.http_get(
    url := 'https://luckmi-ai-trading-investments.vercel.app/api/cron/notifications-dispatch?limit=150',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer my_token'
    ),
    timeout_milliseconds := 30000
  ) as request_id;
  $$
);
