-- Run in Supabase SQL editor.
-- This sets up queue-based engine scheduling using Supabase pg_cron + pg_net.
-- Replace APP_BASE_URL with your Vercel deployment URL before running.
-- DST is handled automatically: two pre-close jobs fire at 19:55 and 20:55 UTC,
-- each guarded by extract(hour from now() AT TIME ZONE 'America/Chicago') = 14
-- so exactly one fires at 2:55 PM CT regardless of CST/CDT.

-- Optional cleanup: remove old schedules if they exist.
select cron.unschedule('luckmi-market-cycle-enqueue-20-min')
where exists (
  select 1
  from cron.job
  where jobname = 'luckmi-market-cycle-enqueue-20-min'
);

select cron.unschedule('luckmi-market-cycle-preclose')
where exists (
  select 1 from cron.job where jobname = 'luckmi-market-cycle-preclose'
);

select cron.unschedule('luckmi-market-cycle-preclose-1955')
where exists (
  select 1 from cron.job where jobname = 'luckmi-market-cycle-preclose-1955'
);

select cron.unschedule('luckmi-market-cycle-preclose-2055')
where exists (
  select 1 from cron.job where jobname = 'luckmi-market-cycle-preclose-2055'
);

select cron.unschedule('luckmi-engine-jobs-drain-every-2-min')
where exists (
  select 1
  from cron.job
  where jobname = 'luckmi-engine-jobs-drain-every-2-min'
);

-- 1) Enqueue active users every 20 minutes.
select cron.schedule(
  'luckmi-market-cycle-enqueue-20-min',
  '*/20 * * * 1-5',
  $$
  select net.http_get(
    url := 'https://APP_BASE_URL/api/cron/market-cycle',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer YOUR_ENGINE_SECRET_HERE'
    ),
    timeout_milliseconds := 30000
  ) as request_id;
  $$
);

-- 2a) Pre-close at 19:55 UTC = 2:55 PM CDT. Guard fires only when Chicago hour = 14.
select cron.schedule(
  'luckmi-market-cycle-preclose-1955',
  '55 19 * * 1-5',
  $body$
  do $$
  begin
    if extract(hour from now() at time zone 'America/Chicago') = 14 then
      perform net.http_get(
        url := 'https://APP_BASE_URL/api/cron/market-cycle',
        headers := jsonb_build_object(
          'Authorization',
          'Bearer YOUR_ENGINE_SECRET_HERE'
        ),
        timeout_milliseconds := 30000
      );
    end if;
  end
  $$;
  $body$
);

-- 2b) Pre-close at 20:55 UTC = 2:55 PM CST. Guard fires only when Chicago hour = 14.
select cron.schedule(
  'luckmi-market-cycle-preclose-2055',
  '55 20 * * 1-5',
  $body$
  do $$
  begin
    if extract(hour from now() at time zone 'America/Chicago') = 14 then
      perform net.http_get(
        url := 'https://APP_BASE_URL/api/cron/market-cycle',
        headers := jsonb_build_object(
          'Authorization',
          'Bearer YOUR_ENGINE_SECRET_HERE'
        ),
        timeout_milliseconds := 30000
      );
    end if;
  end
  $$;
  $body$
);
-- 3) Drain queued jobs every 2 minutes.
select cron.schedule(
  'luckmi-engine-jobs-drain-every-2-min',
  '*/2 * * * 1-5',
  $$
  select net.http_post(
    url := 'https://APP_BASE_URL/api/cron/engine-jobs-drain',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer YOUR_ENGINE_SECRET_HERE',
      'Content-Type',
      'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  ) as request_id;
  $$
);

-- Verify registered jobs.
select jobid, jobname, schedule, active
from cron.job
where jobname in (
  'luckmi-market-cycle-enqueue-20-min',
  'luckmi-market-cycle-preclose-1955',
  'luckmi-market-cycle-preclose-2055',
  'luckmi-engine-jobs-drain-every-2-min'
)
order by jobname;
