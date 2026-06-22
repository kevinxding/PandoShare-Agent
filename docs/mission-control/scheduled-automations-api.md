# Mission Control Scheduled Automations API

Mission Control exposes scheduled automation operations through BackendService actions and local HTTP routes.

## Routes

- `GET /api/mission-control/scheduled`
- `GET /api/mission-control/scheduled/health`
- `GET /api/mission-control/scheduled/:jobId`
- `GET /api/mission-control/scheduled/:jobId/runs`
- `POST /api/mission-control/scheduled`
- `PATCH /api/mission-control/scheduled/:jobId`
- `POST /api/mission-control/scheduled/:jobId/run`
- `POST /api/mission-control/scheduled/:jobId/pause`
- `POST /api/mission-control/scheduled/:jobId/resume`
- `DELETE /api/mission-control/scheduled/:jobId`
- `POST /api/mission-control/scheduled/tick`

## Backend Actions

- `scheduled.create`
- `scheduled.update`
- `scheduled.delete`
- `scheduled.pause`
- `scheduled.resume`
- `scheduled.list`
- `scheduled.get`
- `scheduled.runs`
- `scheduled.tick`
- `scheduled.runNow`
- `scheduled.health`

`system.health` includes scheduled health, and BackendService status lists the scheduled actions.
