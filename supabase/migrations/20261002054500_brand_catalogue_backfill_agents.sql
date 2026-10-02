-- Five staggered brand catalogue enrichment agents.
-- The shared x-agent-token is stored separately in Supabase Vault as
-- brand_backfill_agent_token and is never committed to source control.

do $$
declare
  r record;
begin
  for r in
    select jobid
    from cron.job
    where jobname in (
      'brand-backfill-agent-1',
      'brand-backfill-agent-2',
      'brand-backfill-agent-3',
      'brand-backfill-agent-4',
      'brand-backfill-agent-5'
    )
  loop
    perform cron.unschedule(r.jobid);
  end loop;
end
$$;

select cron.schedule(
  'brand-backfill-agent-1',
  '2 * * * *',
  $cmd$
  select net.http_post(
    url := 'https://eemihhfreggbigxejjhj.supabase.co/functions/v1/brand-catalogue-backfill-agent',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-agent-token', (select decrypted_secret from vault.decrypted_secrets where name = 'brand_backfill_agent_token'),
      'x-worker-id', '0'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 90000
  );
  $cmd$
);

select cron.schedule(
  'brand-backfill-agent-2',
  '14 * * * *',
  $cmd$
  select net.http_post(
    url := 'https://eemihhfreggbigxejjhj.supabase.co/functions/v1/brand-catalogue-backfill-agent',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-agent-token', (select decrypted_secret from vault.decrypted_secrets where name = 'brand_backfill_agent_token'),
      'x-worker-id', '1'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 90000
  );
  $cmd$
);

select cron.schedule(
  'brand-backfill-agent-3',
  '26 * * * *',
  $cmd$
  select net.http_post(
    url := 'https://eemihhfreggbigxejjhj.supabase.co/functions/v1/brand-catalogue-backfill-agent',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-agent-token', (select decrypted_secret from vault.decrypted_secrets where name = 'brand_backfill_agent_token'),
      'x-worker-id', '2'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 90000
  );
  $cmd$
);

select cron.schedule(
  'brand-backfill-agent-4',
  '38 * * * *',
  $cmd$
  select net.http_post(
    url := 'https://eemihhfreggbigxejjhj.supabase.co/functions/v1/brand-catalogue-backfill-agent',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-agent-token', (select decrypted_secret from vault.decrypted_secrets where name = 'brand_backfill_agent_token'),
      'x-worker-id', '3'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 90000
  );
  $cmd$
);

select cron.schedule(
  'brand-backfill-agent-5',
  '50 * * * *',
  $cmd$
  select net.http_post(
    url := 'https://eemihhfreggbigxejjhj.supabase.co/functions/v1/brand-catalogue-backfill-agent',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-agent-token', (select decrypted_secret from vault.decrypted_secrets where name = 'brand_backfill_agent_token'),
      'x-worker-id', '4'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 90000
  );
  $cmd$
);
