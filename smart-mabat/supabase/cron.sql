-- SMART MABAT — reliable scheduler (Supabase pg_cron + pg_net)
-- Calls the agent endpoint every 10 minutes.
--
-- BEFORE running:
--   1. Supabase → Database → Extensions: enable "pg_cron" and "pg_net".
--   2. Replace YOUR-APP with your Vercel domain and YOUR-CRON-SECRET with the value of CRON_SECRET.
--   (The secret is stored in Supabase Vault, not in plain SQL history of the job.)

select vault.create_secret('YOUR-CRON-SECRET', 'smart_mabat_cron_secret');

select cron.schedule(
  'smart-mabat-tick',
  '*/10 * * * *',
  $$
  select net.http_post(
    url     := 'https://YOUR-APP.vercel.app/api/cron/tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'smart_mabat_cron_secret')
    ),
    body    := '{"trigger":"pg_cron"}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- Useful:
--   select * from cron.job;                                  -- list jobs
--   select * from cron.job_run_details order by start_time desc limit 20;
--   select * from net._http_response order by created desc limit 20;
--   select cron.unschedule('smart-mabat-tick');              -- stop
