-- 043_yt_jobs_job_type_check.sql
-- Expand yt_jobs.job_type CHECK to cover values actually written by the
-- worker. The old constraint omitted 'produce' and 'regenerate_timecodes',
-- so every logJob() for those types failed silently — the local logJob
-- helper in worker.ts did not surface insert errors. As a result, the
-- produce pipeline left no audit trail in yt_jobs.

ALTER TABLE yt_jobs DROP CONSTRAINT IF EXISTS yt_jobs_job_type_check;

ALTER TABLE yt_jobs ADD CONSTRAINT yt_jobs_job_type_check
  CHECK (job_type = ANY (ARRAY[
    'sync_channel',
    'transcribe',
    'generate',
    'produce',
    'thumbnail',
    'publish',
    'regenerate_timecodes'
  ]));
