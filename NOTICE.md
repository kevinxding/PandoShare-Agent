# Notices

PandoShare-Agent is an original implementation in this repository. It studies public agent architecture patterns and records license boundaries here.

- OpenCode concepts may inform design; copied MIT-licensed code would require preserving license text.
- Codex concepts may inform design; copied Apache-2.0 code would require preserving license and NOTICE obligations.
- Hermes concepts may inform gateway and daemon design; copied MIT-licensed code would require preserving license text.
- Claude Code research material is clean-room reference only. Do not copy proprietary source, prompts, comments, or text.

## Pando TUI Shell v1

- OpenCode TUI reference: local MIT-licensed source studied at `D:/Users/Lenovo/Desktop/learning-code/opencode/packages/tui`.
- Pando TUI Shell v1 keeps Pando ThreadStore, Model Router, QueryEngine, Approval, Event, and Mission Control as the runtime owner.
- No OpenCode core is vendored as the Pando kernel. Any future copied MIT TUI source must preserve the OpenCode license notice.

## Pando OpenTUI Renderer v1

- The renderer structure is adapted from the MIT-licensed OpenCode TUI patterns: createCliRenderer, Solid JSX routes, prompt panel, dialog layer, and footer/status layout.
- Runtime data flow remains Pando-owned through PandoTuiAdapter; OpenCode core/sdk/server are not used as the Pando kernel.

- Bun relaunch is a Pando wrapper behavior required by the OpenTUI runtime on this Node environment; it does not change Pando backend ownership.
