# Platform rules (`server/`)

`server/` is the shared platform that every team's game builds on: server host, contract, gateway, template game, tooling, CI and deployment. It is owned by the **platform team** (label `platform`). The repo-wide rules in [`../CLAUDE.md`](../CLAUDE.md) apply here too; this file adds the platform rules.

**This folder is a skeleton.** Each package folder has a `README.md` that says what the package does and what goes in it. The platform team builds them, issue by issue, in the order in [README.md](README.md#build-order). How they fit together: [ARCHITECTURE.md](ARCHITECTURE.md).

## Packages

| Package | Path | What it is |
|---|---|---|
| `@sdm/core` | [`core/`](core/README.md) | The contract (`shared`), the simulation contract (`sim`), the Simulation and replay runner (`server`), and the client core (`client`) |
| `@sdm/host` | [`host/`](host/README.md) | `startGameServer()` and `createGameRoom()`: the Colyseus + Express host, routes, logs, stats, room test helpers |
| `@sdm/gateway` | [`gateway/`](gateway/README.md) | The only public service: one address, one path per game |
| `@sdm/template` | [`template/`](template/README.md) | Reference game. Teams copy it to `games/team-N/` to start |
| `@sdm/tooling` | [`tooling/`](tooling/README.md) | Shared TypeScript config and the repository scripts and checks |

Platform docs live in `server/ARCHITECTURE.md` and [`server/docs/`](docs/README.md).

## Rules for teams

- Your game lives in `games/team-N/` and is its own package (`@team-N/game`). Import the platform only through package names: `@sdm/core/shared`, `@sdm/core/sim`, `@sdm/core/server`, `@sdm/core/client`, `@sdm/host`, `@sdm/host/testing`.
- Never import from another team's folder, and never import platform files by relative path (`../../server/...`).
- Need a platform change? Open an issue with the `platform` label that says what your team needs and why. Don't patch `server/` from a team PR.

## Rules for platform changes

- A platform change can break every game, so keep platform PRs small and focused.
- Changes to the contract (`core/src/shared/`) are breaking by default. Say in the PR which games are affected and how they migrate.
- Typecheck and tests run for every workspace package, so a platform PR is only green when every team's game still builds.
- Don't add a dependency to a platform package unless every game benefits. Game-specific dependencies belong in `games/team-N/package.json`.

## Writing a game (the game definition)

- Put the rules in `games/team-N/shared/game.ts` as a `GameDefinition` from `@sdm/core/sim`, following `server/template/shared/game.ts`.
- The definition and everything in `shared/` stay browser-safe: import only `@colyseus/schema`, `zod`, `@sdm/core/shared` and `@sdm/core/sim`. Never `colyseus`, `@sdm/host`, `@sdm/core/server` or `node:*`. The client imports it to predict.
- Your state extends `BaseState`. Don't write `tick`, `code`, `paused` or `seats` yourself; the room base owns them.
- Your config schema extends `RoomSettingsSchema`, and `config/game.json` sets `tickRate`, `patchRate`, `maxPlayers` and `reconnectSeconds`.
- Register rooms in `room/index.ts` as factories: `{ game: (deps) => createGameRoom(myGame, deps) }`.
- Debug commands go in `commands`. They are recorded in replays and rejected in production.

## Determinism rules (all game code)

Replays only work if the simulation is deterministic:

- Use the room's `SeededRandom` (`@sdm/core/shared`). Never `Math.random()` in simulation code.
- Advance the simulation only in fixed ticks. Never read wall-clock time (`Date.now()`, `performance.now()`) inside the simulation.
- Validate every client message with a zod schema before using it.
- Keep tuning values in `config/*.json`, validated by the game's config schema.

## Colyseus 0.18

Colyseus 0.18 changed many APIs compared with older versions (and with most examples online). Before writing Colyseus code, check the [Colyseus 0.18 documentation](https://docs.colyseus.io/) and the migration notes, and tell your AI agent to do the same.

## Cross-platform rules

- LF line endings everywhere (`.gitattributes`), also on Windows.
- No file names that differ only by case: they break on Linux, which is what CI and Railway run.
- Scripts are TypeScript or plain Node.js, never bash, so they run on every OS.
