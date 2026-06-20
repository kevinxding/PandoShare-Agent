# Kernel Acceptance Report

Status: verified for Durable Runtime V1.

## Durable Runtime V1 Completed Items

- Added durable `EventStore` with append-only writes and workspace seq allocation.
- Added durable `EventSeq` using core atomic state and in-process locking.
- Added durable `EventIndex` for run/thread event reads.
- Added basic secret redaction for durable event/checkpoint/heartbeat payloads.
- Added checkpoint safety types with `safe_to_replay`, `unsafe_to_replay`, and `partial_replay`.
- Added checkpoint fields for `lastEventSeq`, `summary`, `snapshotRef`, unsafe tool ids, and pending external effects.
- Added `RunSnapshotStore` and recovery pointer snapshots.
- Upgraded heartbeat records with worker id/type, run linkage, last seq, and stale checks.
- Added `RecoveryPlanner` with conservative auto-recovery decisions.
- Added `ConsistencyAudit` for event order, terminal events, checkpoint/snapshot seq references, and ledger drift.
- Reworked `DurableRuntime` into the public facade for events, checkpoints, run snapshots, heartbeat, recovery, and audit.
- Updated `AgentKernel` so durable seq is assigned by DurableRuntime and returned in `coreEvents`.
- Updated `AgentKernel` to write run snapshots for core lifecycle events.
- Updated `AgentKernel` failed checkpoints to default to `partial_replay`.
- Updated interrupted checkpoints to remain `unsafe_to_replay`.
- Updated `AgentKernelEventBridge` to persist legacy lifecycle events as `legacy_run_*` so audit does not confuse them with canonical terminal events.
- Updated `AttemptRunner` to write `loop_attempt` events through the AgentKernel event helper.
- Updated ReplayReader to read through DurableRuntime.
- Updated ReplayReport with run metadata, checkpoint list, recovery decision, and audit output.
- Added `scripts/durable-smoke.mjs` and `npm run durable:smoke`.
- Added `docs/kernel/durable-runtime-v1.md`.

## RecoveryDecision Coverage

Covered by smoke tests:

- Completed run -> `already_completed`.
- Interrupted run -> `requires_human`.
- Pending external effects -> `requires_human`.
- Ledger/snapshot drift -> `mark_corrupted`.

Implemented behavior also covers:

- Failed run with partial replay and no pending effects -> `recoverable_auto`.
- Failed run without partial replay boundary -> `mark_failed`.
- Active heartbeat -> `requires_human`.
- Pure starting/model/checkpoint phase -> `recoverable_auto`.

## Test Results

All commands below were run locally from the repository root.

| Command | Result |
|---|---|
| `npm run typecheck` | passed |
| `npm run check` | passed |
| `npm run kernel:smoke` | passed |
| `npm run durable:smoke` | passed |
| `npm run events:smoke` | passed |
| `npm run thread-store:smoke` | passed |
| `npm run loop-runtime:smoke` | passed |
| `npm run gateway:smoke` | passed |
| `npm run gui-tool:smoke` | passed |
| `npm run model-smoke` | passed |

## Incomplete Items

- `QueryEngine` still owns context building, compaction, tool execution, thread messages, and legacy run ledger writes.
- `RunLedger` still lives in `src/core/agent`; DurableRuntime reads it for audit but does not fully own it yet.
- Tool events are bridged generically, not fully normalized into typed core tool event payloads.
- Checkpoint pending external effects are recorded when supplied; deeper automatic side-effect detection is still future work.
- Replay is read-only; there is no replay CLI or resume runner in this pass.
- Event seq locking is process-local plus atomic state; cross-process contention should be hardened in Durable Runtime V2.

## Risks

- Legacy ThreadStore and core DurableRuntime can temporarily contain parallel event histories.
- Recovery decisions are intentionally conservative and may require human review more often than necessary.
- Import mode can write pre-sequenced events and should stay limited to tests/migration tools.
- Audit appends `run_corruption_detected` when corruption is found; downstream replay consumers should treat that as diagnostic, not a terminal status.

## Next Step Suggestions

- Move `RunLedger` fully behind DurableRuntime.
- Add typed tool-event bridge payloads and side-effect classification.
- Add durable artifact refs for large tool results.
- Add Replay CLI for `runId` and `threadId` timelines.
- Migrate ThreadStore metadata/messages/checkpoints onto core store primitives.
