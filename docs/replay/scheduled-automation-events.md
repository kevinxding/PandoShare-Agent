# Scheduled Automation Replay Events

Scheduled Automations V1 emits durable events with the `scheduled_` prefix. Event replay categorizes these as `scheduled` timeline items.

## Event Types

- `scheduled_job_created`
- `scheduled_job_updated`
- `scheduled_job_deleted`
- `scheduled_job_paused`
- `scheduled_job_resumed`
- `scheduled_tick_started`
- `scheduled_tick_completed`
- `scheduled_run_started`
- `scheduled_run_completed`
- `scheduled_run_failed`
- `scheduled_run_skipped`

The original job and run JSONL files remain the source for job state and run history; durable events are the replay timeline surface.
