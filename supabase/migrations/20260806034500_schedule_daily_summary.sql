create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
declare
  existing_job_id bigint;
begin
  select jobid
    into existing_job_id
    from cron.job
   where jobname = 'aguipunt-daily-summary'
   limit 1;

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'aguipunt-daily-summary',
    '0 1 * * *',
    $command$
      select net.http_post(
        url := 'https://dqymnwbfnuimjfdnwaqb.supabase.co/functions/v1/api/api/bot/cron-daily-summary',
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body := '{}'::jsonb
      );
    $command$
  );
end
$$;
