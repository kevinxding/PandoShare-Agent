# Event Replay V2 / Operator Debugger

## Boundary

Event Replay V2 is the read-only observability and incident-debugging kernel for PandoShare-Agent. It reads durable events, safe projection caches, checkpoints, recovery decisions, audits, and artifact refs, then rebuilds what happened across AgentKernel, LoopRuntime, GuiRuntime, GatewayDaemon, ModelRouter, tools, approvals, and checkpoints.

Replay is not an execution layer. It does not execute tools, call models, operate GUI, dispatch gateway messages, approve human gates, repair corruption, mutate checkpoints, or replay unsafe side effects.

## Why It Is An Operator Debugger

A logger prints events. Operator Debugger reconstructs causality, projects state, detects incidents, recommends safe next steps, exports evidence bundles, and feeds future Web Mission Control. The goal is to answer: what triggered this run, what happened across the seven kernels, what failed, what evidence proves it, and what should an operator inspect next.

## Replay Query Model

ReplayService accepts explicit scoped queries:

- `run`
- `thread`
- `loop`
- `goal`
- `gui_action`
- `gateway_inbound`
- `gateway_delivery`
- `model_route`
- `checkpoint`
- `time_range`
- `workspace`

Unbounded workspace reads are rejected unless `includeAll=true` and caller is `test` or `maintenance`. `time_range` requires seq or time bounds. Payload mode defaults to summary and strict redaction defaults on.

## Causal Graph

ReplayCausalGraph builds nodes for event, command, run, thread, loop, goal, task, attempt, tool call, GUI action, gateway inbound/outbound, model route, checkpoint, approval, recovery, artifact, and legacy bridge. Strong edges come from `parentEventId`; synthetic edges come from shared ids such as runId, loopId, routeId, guiActionId, deliveryId, and checkpointId.

The graph exposes roots, leaves, orphan nodes, and warnings. Imperfect event history is treated as debugging input, not a fatal parser error.

## Cross-Core Projectors

ReplayProjectors create unified projections for:

- Run
- Thread
- Loop
- GUI
- Gateway
- Model
- Tool
- Checkpoint
- Recovery
- Approval

Each projection includes status, summary, important ids, timeline items, warnings, errors, and metrics.

## Incident Taxonomy

ReplayIncidentDetector covers these incident kinds:

- missing_parent_event
- orphan_terminal_event
- duplicate_terminal_event
- run_without_checkpoint
- checkpoint_seq_missing
- unsafe_recovery_attempt
- pending_external_effect
- stuck_gui_action
- gateway_delivery_failed
- gateway_retry_exhausted
- loop_blocked
- loop_human_gate_pending
- model_fallback_exhausted
- model_budget_exceeded
- model_rate_limited
- approval_expired
- corruption_detected
- event_seq_gap
- event_out_of_order
- legacy_bridge_only
- payload_secret_suspected
- oversized_payload
- unknown_event_type
- replay_projection_mismatch

Incident ids are stable hashes over scope, kind, event ids, and important ids.

## Operator Recommendations

Every error or critical incident receives a recommendation. Recommendations are advisory only and are never auto-executed. Unsafe GUI, gateway, shell, MCP, and file-write situations recommend manual review. Corruption recommends export bundle plus maintenance review before repair.

## Report Formats

ReplayReport V2 supports:

- Markdown: human-readable operator report.
- JSON: machine-readable Mission Control/API payload.
- Bundle: folder manifest with `report.md`, `report.json`, `events.jsonl`, `graph.json`, `artifacts-manifest.json`, and `manifest.json`.

## Artifact Manifest

ReplayArtifactManifest records refs only by default. Supported kinds include tool result refs, screenshot refs, observation refs, diff refs, checkpoint refs, thread export refs, gateway raw refs, model usage refs, and legacy refs. Large artifact contents are not copied by default.

## Redaction Rules

ReplayRedactor defaults to strict mode. It redacts API keys, authorization headers, bearer tokens, cookies, webhook URLs, gateway tokens, pairing secrets, password-like fields, and raw request headers. Env key names may remain; env values must not. The report includes a redaction summary with field count and paths, not secret values.

## CLI Commands

- `pando replay run <runId>`
- `pando replay thread <threadId>`
- `pando replay loop <loopId>`
- `pando replay gui <guiActionId>`
- `pando replay gateway <inboundId|deliveryId>`
- `pando replay model <routeId>`
- `pando replay range --from-seq N --to-seq M`
- `pando replay export --run <runId> --out <dir>`
- `pando replay incidents <runId|--loop loopId>`
- `pando replay graph <runId> --json`

## Server API

- `GET /api/replay/run/:runId`
- `GET /api/replay/thread/:threadId`
- `GET /api/replay/loop/:loopId`
- `GET /api/replay/gui/:guiActionId`
- `GET /api/replay/gateway/:id`
- `GET /api/replay/model/:routeId`
- `GET /api/replay/incidents`
- `POST /api/replay/export`

APIs return JSON by default and support `?format=markdown` for report endpoints.

## Gateway Commands

- `/replay run <runId>`
- `/replay loop <loopId>`
- `/replay gui <guiActionId>`
- `/replay gateway <inboundId|deliveryId>`
- `/replay model <routeId>`
- `/replay incidents <runId|loopId>`
- `/replay help`

Gateway replay commands route to dispatcher callbacks. Gateway does not directly read JSONL.

## Safety Principle

Replay recommendations never execute recovery. Replay does not automatically resume runs, approve gates, retry gateway deliveries, operate GUI, or dispatch side effects. It explains and exports evidence so an operator can decide.

## Not Finished Yet

- Web Mission Control UI.
- Real-time replay stream.
- Visual graph UI.
- Remote artifact browser.
- Golden trace library.
- Training trajectory export.
- Provider/model-assisted `replay_audit` task; Replay V2 intentionally does not call models in this phase.