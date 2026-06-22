# Third Party Dependency Baseline

This baseline uses package.json as the local dependency source of truth. License metadata is reported as unknown unless already present locally; no registry query is performed by the audit smoke.

Run npm run security:license-smoke and npm run security:report-smoke before release decisions.

## TUI Shell Dependencies

Pando TUI Shell v1 declares the OpenTUI-oriented dependency stack used by the OpenCode TUI reference so the renderer can move from the current adapter shell to a richer component renderer without changing the Pando backend boundary.

- @opentui/core 0.3.4
- @opentui/keymap 0.3.4
- @opentui/solid 0.3.4
- opentui-spinner 0.0.7
- clipboardy 4.0.0
- diff 8.0.2
- fuzzysort 3.1.0
- strip-ansi 7.1.2

OpenCode itself is MIT licensed. Pando v1 records it as a reference source, not a vendored runtime core.
