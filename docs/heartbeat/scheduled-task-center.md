# Scheduled Task Center Heartbeat

The scheduled task center is designed for 7x24 local operation without turning every heartbeat into model work.

## Tick Flow

1. Read due active jobs from `.pandoshare/scheduled/jobs.jsonl`.
2. Enforce idempotency by checking `(jobId, nextRunAtMs)` in `runs.jsonl`.
3. Record `scheduled_run_started`.
4. Execute the job action through the scheduled executor.
5. Record completed, failed, or skipped run state.
6. Compute and persist the next run time.

## Gateway Service

`GatewayServiceRuntime` accepts:

- `enableScheduledAutomations?: boolean`
- `maxScheduledJobsPerTick?: number`
- `scheduledRuntime?: ScheduledAutomationRuntime`

The default is disabled. When enabled, scheduled tick failures are written to heartbeat metadata and do not crash Gateway service ticks.
