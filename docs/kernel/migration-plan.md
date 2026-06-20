# Kernel Migration Plan

## Existing Module Mapping

| Current module | Target kernel | Migration path |
|---|---|---|
| `src/QueryEngine.ts` | Agent Kernel | Keep as legacy executor. Wrap with `src/core/agent/AgentKernelAdapter.ts`. New entry points submit `CommandEnvelope` to `AgentKernel`. |
| `src/services/threadStore` | Durable Runtime | Keep existing thread format. Reuse core store primitives for future atomic metadata writes and append-only event/checkpoint stores. |
| `src/services/events` | Protocol / Event Replay | Keep existing `AgentEvent`. Wrap legacy events with `agentEventToEnvelope` into `EventEnvelope`. |
| `src/services/permissions` | Protocol / Agent Kernel | Keep current terminal/web approvals. Represent new human gates as approval commands/events. |
| `src/services/contextBuilder` | Agent Kernel | Keep inside QueryEngine path for now. Later expose context build events as `EventEnvelope`. |
| `src/services/compact` | Durable Runtime / Agent Kernel | Keep current compaction implementation. Treat compaction as checkpoint-like durable state. |
| `src/services/llm` | Model Router | Wrap provider definitions with `ProviderRegistry` and route requests through `ModelRouter`. |
| `src/services/loopRuntime` | Loop Runtime | Keep full legacy loop implementation. New `src/core/loop` defines canonical types and AgentKernel-only submission path. |
| `src/services/gatewayRuntime` | Gateway Daemon | Keep current rich gateway runtime. New `src/core/gateway` defines durable command routing, delivery queue, heartbeat, and reconnect boundaries. |
| `src/services/gui` | GUI Runtime | Keep Dingxu/Windows MCP integration. Wrap it with `DingxuGuiAdapter`; expose only stable `GuiRuntime` action records to models. |
| `src/server` | Entry point | Server may depend on core. It should not be a state source. Web chat now uses `AgentKernel`. |
| `src/main.tsx` | Entry point | CLI may depend on core. Prompt and exec now use `AgentKernel`. |
| `web/src/App.tsx` | UI only | Web UI stays a client of server APIs. It must not own durable runtime state. |

## Phase 1: Core Boundary

Implemented in this pass:
- Create `src/core/protocol`.
- Create `src/core/store`.
- Create `src/core/durable`.
- Add `ThreadStoreAdapter` for reading legacy thread events as `EventEnvelope` views.
- Create `src/core/agent`.
- Add minimal Loop, GUI, Gateway, Model, and Replay kernels.
- Add `src/core/index.ts` public exports.
- Add `kernel:smoke`.

## Phase 2: Legacy Store Migration

Next work:
- Replace duplicated `writeIfMissing` helpers with `AtomicFileStore.writeIfMissing`.
- Move ThreadStore metadata writes to `AtomicFileStore.writeJson`.
- Let ThreadStore append core `EventEnvelope` beside legacy `AgentEvent`.
- Add replay views for legacy thread event streams.

## Phase 3: Entry Point Hardening

Next work:
- Remove direct `new QueryEngine` from non-test runtime modules.
- Keep direct `QueryEngine` construction only in focused legacy smoke tests.
- Move Web and Gateway command entry points to `CommandEnvelope`.
- Add typed command handlers for `/goal`, `/status`, `/stop`, approval, and GUI action commands.

## Phase 4: Runtime Auditability

Next work:
- Add `runId` propagation from `AgentKernel` into `QueryEngine`.
- Persist core `EventEnvelope` IDs in thread checkpoints.
- Link GUI screenshots and tool result storage to replay reports.
- Add replay CLI command.

## Risk Notes

- The current implementation is intentionally minimal and adapter-based.
- `QueryEngine` still owns context building, compaction, tool execution, and thread messages.
- This avoids breaking the working path while establishing the seven-kernel boundary.
