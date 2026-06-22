# Pando TUI Shell v1

Pando TUI Shell v1 replaces the old bare `pando>` prompt with an OpenCode-style terminal shell while keeping Pando as the runtime owner. The shell uses a Pando adapter boundary, so UI code does not reach directly into ThreadStore, Model Router, QueryEngine, Approval, Event, or Mission Control internals.

## Commands

- `pando`: open the TUI shell.
- `pando tui`: open the TUI shell explicitly.
- `pando tui --smoke`: initialize and render once, then exit for automation.
- `pando repl`: open the legacy text REPL.
- `pando exec "Hello"`: run a non-interactive prompt.

## Adapter Contract

The TUI talks to `PandoTuiAdapter` only. The adapter exposes thread list/resume/create, message sending, event reads, model selection, approval reads/answers, and Mission Control status. This lets the renderer evolve toward a richer OpenTUI/Solid implementation without replacing the Pando backend.

## v1 Scope

Implemented in v1:

- thread list, new thread, resume thread;
- user input to Pando QueryEngine/AgentKernel;
- model provider list and selection state;
- pending approval list/answer adapter methods;
- Mission Control baseline status lines;
- smoke-safe fake adapter for launch and shell tests.

Not wired yet:

- full OpenCode component tree;
- mouse-native panes and keymap parity;
- rich diff/tool transcript panes;
- persistent TUI layout preferences.

## OpenCode Boundary

The visual target and dependency stack are based on the local OpenCode TUI reference at `D:/Users/Lenovo/Desktop/learning-code/opencode/packages/tui`. Pando v1 does not vendor OpenCode core and does not make OpenCode the runtime kernel. Copied MIT source must keep the OpenCode license notice; this v1 shell is a Pando-side adapter implementation.

## OpenTUI Renderer v1

The default `pando` and `pando tui` entrypoints now use an OpenTUI/Solid renderer instead of the original ASCII shell. The old shell remains available through `pando tui --plain` for debugging.

The v1 renderer focuses on the OpenCode-like home screen, session screen, prompt input, footer status, model/thread/command dialogs, and the Pando adapter boundary.

## Runtime note

OpenTUI requires Bun or a Node runtime with FFI enabled. On Windows the normal `pando` Node wrapper automatically relaunches `pando` / `pando tui` through Bun when using the OpenTUI renderer. Non-TUI commands stay on Node. Use `pando tui --plain` to force the legacy ASCII shell.
