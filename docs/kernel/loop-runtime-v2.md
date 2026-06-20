# Loop Runtime V2

## Responsibility Boundary

Loop Runtime V2 is the first durable control plane for Pando loops. It owns goal, plan, task, attempt, verification, human-gate, checkpoint, recovery, and projection semantics. It does not execute tools directly and does not call GUI, gateway, model router, or raw backend adapters.

Task execution goes through `AgentKernel.submitRun`. Legacy loop execution can continue through `src/services/loopRuntime`, but legacy records must be bridged into the durable loop contract through `LoopLegacyAdapter` during migration.

## Control Plane, Not Execution Engine

The loop is responsible for deciding what should happen next and recording why. The execution engine remains AgentKernel and its tool/runtime adapters. This keeps loop recovery explainable and prevents unsafe replay of shell, GUI, gateway, or file-write effects.

## Event Contract

Loop V2 writes fine-grained durable events:

- `loop_goal_created`
- `loop_plan_created`
- `loop_task_created`
- `loop_task_queued`
- `loop_task_started`
- `loop_task_completed`
- `loop_task_failed`
- `loop_attempt_started`
- `loop_attempt_completed`
- `loop_attempt_failed`
- `loop_verification_started`
- `loop_verification_completed`
- `loop_human_gate_requested`
- `loop_human_gate_resolved`
- `loop_checkpoint_created`
- `loop_recovery_decided`
- `loop_resumed`
- `loop_blocked`
- `loop_completed`
- `loop_legacy_event_bridged`

The old `loop_iteration` event may remain for compatibility, but V2 state is not allowed to depend on that single coarse event.

## Projection Rules

`LoopProjector` is a pure event projector. It reads no files, uses no clock, and calls no runtime services. Given the same sorted durable events, it rebuilds `LoopState`, `GoalState`, `TaskState`, and `AttemptState` deterministically.

Important projection rules:

- goal created means `created`.
- plan and task creation move the loop to `planned`.
- task or attempt start moves it to `running`.
- human gate request moves it to `waiting_human`.
- human gate resolve moves it back to `planned` or `blocked`.
- task failures increase `failureCount`.
- terminal conflicts are warnings, not silent overwrites.
- `loop_resumed` does not override terminal completed state unless an explicit force flag is present.

## LoopStateStore

`LoopStateStore` is only a projection cache. It stores `derivedFromSeq`, `projectedAtMs`, and the derived state. Durable events remain the source of truth. If the durable latest seq for a loop is greater than `derivedFromSeq`, the cache is reprojected.

No external module should mutate this cache as authoritative state.

## Scheduler Decision Matrix

`LoopScheduler` only returns decisions. It never executes tools or agent runs.

| Condition | Decision |
| --- | --- |
| no task | `blocked` |
| pending human gate | `wait_human` |
| queued task | `run_task` |
| failed task below retry limit | `run_task` |
| failed task at retry limit | `blocked` |
| all tasks completed | `completed` |
| active task or attempt | `noop` |

Default retry limit is 3 attempts.

## Recovery Decision Matrix

`LoopRecovery` reads durable events and durable run recovery data. `recoverLoop` writes `loop_resumed` and `loop_recovery_decided`. It does not call `runNext` unless a future caller explicitly enables auto-run.

| Condition | Decision |
| --- | --- |
| completed loop | `already_completed` |
| pending human gate | `requires_human` |
| pending external effects | `requires_human` |
| unsafe latest checkpoint | `requires_human` |
| durable audit errors | `mark_corrupted` |
| no task events | `mark_corrupted` |
| legacy bridge events only | `requires_legacy_bridge` |
| queued or recoverable state | `recoverable_auto` |

## Human Gate Contract

`HumanGate.createRequest` writes `loop_human_gate_requested` with `gateId`, `reason`, `risk`, `requestedAction`, and `createdAtMs`. `resolveRequest` writes `loop_human_gate_resolved` with approve or reject information. Web, CLI, and gateway approval UI should translate user choices into these events through commands; they are not implemented in this V2 core step.

## Legacy Adapter

`LoopLegacyAdapter` is a migration bridge. It converts legacy loop events into `loop_legacy_event_bridged` and can produce a minimal legacy projection summary. It does not change the legacy `.pandoshare/loops` file format and does not replace `src/services/loopRuntime` yet.

## Unfinished Items

- real daemon scheduling
- multi-task concurrency
- sub-agent verifier execution
- skill write-back
- worktree pool orchestration
- gateway approval UI
- full legacy loop import and one-time migration tooling
