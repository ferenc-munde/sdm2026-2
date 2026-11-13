# `@sdm/core`

The platform's shared code. Four entry points, each importable on its own:

| Entry point | Folder | Runs in | What goes in it |
|---|---|---|---|
| `@sdm/core/shared` | `src/shared/` | browser and server | **The contract**: `env` (`AppEnv`, `HealthResponse`, `isDebugEnabled()`), `messages` (WebSocket message names, HTTP routes, input envelope, debug commands, bug reports), `replay` (replay file format), `random` (`SeededRandom`) |
| `@sdm/core/sim` | `src/sim/` | browser and server | **The simulation contract**: `GameDefinition` (`createState`, `init`, `join`, `leave`, `step`, optional `disconnect`/`reconnect`, debug `commands`), `BaseState`, `RoomSettingsSchema` |
| `@sdm/core/server` | `src/server/` | server only | **The Simulation**: applies and records every event, room codes, state hash, replay runner, stats, built-in debug commands |
| `@sdm/core/client` | `src/client/` | browser only | **The client core**: prediction, interpolation, network stats, guest id, URL parameters, debug overlay and console, bug report button |

Rules:

- `shared` and `sim` stay browser-safe: no `colyseus`, no `node:*`.
- A change to `shared` is a breaking change for every game: say in the PR which games are affected.
- Everything in `server` and `sim` is deterministic (see [../CLAUDE.md](../CLAUDE.md#determinism-rules-all-game-code)).
