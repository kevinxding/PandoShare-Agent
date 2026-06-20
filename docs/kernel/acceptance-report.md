# Kernel Acceptance Report

Status: verified with noted migration leftovers.

## Completed Items

- Added `src/core/protocol`.
- Added `src/core/store`.
- Added `src/core/durable`.
- Added `src/core/agent`.
- Added `src/core/loop`.
- Added `src/core/gui`.
- Added `src/core/gateway`.
- Added `src/core/model`.
- Added `src/core/replay`.
- Added `src/core/index.ts`.
- Added `ThreadStoreAdapter` for legacy thread event envelope views.
- Added `scripts/kernel-smoke.mjs`.
- Added `npm run kernel:smoke`.
- Routed CLI prompt/exec through `AgentKernel`.
- Routed Web chat through `AgentKernel`.
- Routed legacy LoopRuntime iterations through `AgentKernel`.

## Test Results

All commands below were run locally from the repository root.

| Command | Result |
|---|---|
| `npm run typecheck` | passed |
| `npm run kernel:smoke` | passed |
| `npm run check` | passed |
| `npm run events:smoke` | passed |
| `npm run thread-store:smoke` | passed |
| `npm run loop-runtime:smoke` | passed |
| `npm run gateway:smoke` | passed |
| `npm run gui-tool:smoke` | passed |
| `npm run model-smoke` | passed |

Additional audit:

- Runtime entry points `src/main.tsx`, `src/server/index.ts`, and legacy `src/services/loopRuntime/index.ts` now instantiate `AgentKernel`.
- Direct `new QueryEngine` remains only in `src/core/agent/AgentKernelAdapter.ts` and legacy smoke scripts.
- `DurableRuntime.createCheckpoint` and `DurableRuntime.writeHeartbeat` now persist both the durable record and a matching `EventEnvelope`.

## Incomplete Items

- ThreadStore is adapted into core replay views, but not fully migrated to core store primitives yet.
- Existing legacy services still have their own durable helpers.
- Core `EventEnvelope` persistence is active for new core kernels, but legacy `AgentEvent` streams are not fully duplicated into core replay storage yet.
- `runId` propagation from `AgentKernel` into the inner `QueryEngine` remains adapter-level rather than a single shared run id.

## Risks

- This is a boundary pass, not a full replacement of legacy runtime internals.
- Direct `QueryEngine` usage remains in smoke scripts for legacy behavior coverage.
- The next migration should move duplicated JSON/JSONL helpers in legacy stores onto `src/core/store`.
