# Kernel Boundaries

## Allowed Direction

- `cli -> core`
- `server -> core`
- `web -> server/api -> core`
- `gateway -> core`
- `core adapter -> legacy services`
- `legacy services -> existing local helpers`

## Forbidden Direction

- `core -> web`
- `core -> cli`
- `core -> server`
- `core -> desktop UI state`
- `gateway -> QueryEngine`
- `loop -> QueryEngine`
- `model -> GUI raw tools`
- `GUI raw tools -> model-facing API`

## Command Boundary

All external entry points should submit a `CommandEnvelope`. They should not manually assemble a private Agent execution flow.

Current state:
- CLI prompt/exec uses `AgentKernel`.
- Web chat uses `AgentKernel`.
- Legacy LoopRuntime uses `AgentKernel`.
- Existing smoke scripts may still instantiate `QueryEngine` directly as focused legacy tests.

## Event Boundary

All durable state changes should create an `EventEnvelope`.

Current state:
- `AgentKernel` creates core run events.
- `GuiRuntime` creates core GUI events.
- `GatewayDaemon` creates core gateway events.
- `LoopRuntime` creates core loop events.
- Legacy `src/services/events` stays in place and can be wrapped through `agentEventToEnvelope`.

## Durable Boundary

Long-running state belongs in append-only or atomic durable stores:
- JSON state: `AtomicFileStore`
- JSONL logs: `JsonlStore`
- checkpoints: `CheckpointManager`
- heartbeat: `HeartbeatManager`
- replay events: `DurableRuntime.eventStore`

## Adapter Rule

Legacy services can remain active only behind adapters.

Adapter markers:
- `AgentKernelAdapter` wraps `QueryEngine`.
- `DingxuGuiAdapter` wraps `src/services/gui`.

New core code should not import Web, CLI, or server modules.
