# Seven Kernels

PandoShare-Agent is being narrowed into seven runtime kernels. The goal is not to replace existing working services in one step. The goal is to create stable boundaries so CLI, Web, Gateway, Loop, GUI, tools, and model calls can share one command/event/durable runtime path.

## 1. Agent Kernel

Path: `src/core/agent`

Responsibility:
- Accept `CommandEnvelope` as the single Agent run input.
- Own run state transitions.
- Emit `EventEnvelope` for run start, completion, failure, interruption, and approval wait states.
- Wrap legacy `QueryEngine` through `AgentKernelAdapter`.

Current adapter:
- `QueryEngine` remains the executor.
- `AgentKernel` owns command submission and core event/checkpoint persistence.

## 2. Durable Runtime

Paths: `src/core/durable`, `src/core/store`

Responsibility:
- Provide atomic JSON writes.
- Provide append-only JSONL reads and writes.
- Keep corrupted JSONL records from crashing the whole runtime.
- Persist checkpoints, heartbeat records, runtime state, and core events.

## 3. Loop Runtime

Path: `src/core/loop`

Responsibility:
- Represent `Goal -> Plan -> Task -> Attempt -> Verify -> HumanGate -> Checkpoint`.
- Submit work through `AgentKernel`.
- Avoid private calls into `QueryEngine`.
- Avoid infinite retry loops.

## 4. GUI Runtime

Path: `src/core/gui`

Responsibility:
- Expose stable `gui_action` semantics.
- Wrap Dingxu GUI or a mock adapter.
- Record before observation, action, after observation, verification, screenshot reference, and event id.
- Require approval for dangerous GUI actions.

## 5. Gateway Daemon

Path: `src/core/gateway`

Responsibility:
- Treat robot/mobile channels as long-running command sources.
- Convert inbound messages into `CommandEnvelope`.
- Persist inbound/outbound delivery queue records.
- Write heartbeat records.

## 6. Model Router

Path: `src/core/model`

Responsibility:
- Wrap existing OpenAI, DeepSeek, MiniMax, and custom OpenAI-compatible provider definitions.
- Select a model by task type.
- Track model health and basic usage/cost records.

## 7. Event Replay

Path: `src/core/replay`

Responsibility:
- Read `EventEnvelope` streams.
- Build an auditable run timeline.
- Produce Markdown replay reports.
- Warn on incomplete events without crashing replay.
