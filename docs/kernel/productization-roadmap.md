# Productization Roadmap

This roadmap starts after Reality Alignment acceptance is in place. It is intentionally staged so later product work cannot outrun source/docs/script proof.

| Phase | Goal | Acceptance authority |
| --- | --- | --- |
| 1. Backend Service Facade | Split stable backend service boundaries without changing behavior | Server/API smoke plus replay traces |
| 2. ToolRuntime V2 | Promote tool execution, typed events, and result storage into a core runtime | ToolRuntime V2 smoke and replay projections |
| 3. Code Agent Harness | Build first-class code editing, patching, test, and review loops | Harness smoke with real patch/test evidence |
| 4. Context/Memory V2 | Move compaction, memory, and token accounting into audited core views | Context and compaction golden traces |
| 5. Worktree/Sandbox | Add safe workspace isolation and rollback policies | Worktree smoke and destructive-action approvals |
| 6. Loop Engineering V3 | Add richer loop specs, verifier graphs, and manual gates | Loop recovery and long-run acceptance |
| 7. Dingxu GUI Benchmark | Measure GUI action reliability, speed, focus, and recovery | Real GUI benchmark ledger |
| 8. Gateway real daemon | Package long-running gateway process and restart behavior | Gateway daemon 24h evidence |
| 9. Model production probes | Add live provider health, latency, cost, and capability probes | Provider probe report with redacted secrets |
| 10. Replay golden traces | Maintain stable traces for regressions and incident training | Golden replay diff smoke |
| 11. Mission Control backend APIs | Expose operator state for a mature Web UI | API contract smoke before UI work |
| 12. Security/License | Audit secrets, approvals, dependency licenses, and copied-code provenance | Security/license report |
| 13. CI/Release | Run acceptance gates in clean automation | CI status and generated acceptance report |
| 14. 72h Chaos | Exercise crashes, restarts, stale locks, gateway wakeups, and GUI stuck states | 72h chaos report |
| 15. Cloud worker foundation | Prepare optional cloud coordination without replacing local-first runtime | Cloud worker boundary smoke |
