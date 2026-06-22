# Scheduled Automations V1

Scheduled Automations V1 adds a local heartbeat task center on top of the existing automation queue instead of replacing it.

## Runtime

- Core path: `src/core/scheduled-automations/`.
- Store path: `.pandoshare/scheduled/jobs.jsonl` and `.pandoshare/scheduled/runs.jsonl`.
- Legacy queue path remains `.pandoshare/automation/` and is read as a projected view only.
- Gateway service integration is opt-in through `enableScheduledAutomations`.

## Schedules

Supported in v1:

- `@now` and `@once`.
- `@every 5m`, plus `ms`, `s`, `m`, and `h` units.
- `*/N * * * *` interval cron.
- Daily `{ kind: "daily", time: "HH:mm", timezone: "local" | "UTC" }`.

Complex cron expressions are accepted as unsupported records and skipped with `unsupported_cron_expression` instead of being silently misrun.

## Actions

Supported actions:

- `gateway_message`: queue a Gateway outbound message.
- `remote_trigger`: write a legacy automation trigger for Gateway compatibility.
- `system_event`: write a durable scheduled system event.
- `loop_wake`: call the configured wake scheduler when available.
- `agent_turn`: supported by schema; requires an injected backend handle.

Denied by default:

- `command`
- `webhook`

These are schema-only in v1 and do not run shell or network side effects.
