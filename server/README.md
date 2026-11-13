# Platform

This folder belongs to the **platform team** (label `platform`): the shared game server platform, tooling, CI and deployment that every game in `games/` runs on. Game teams do not change this folder directly: they open an issue with the `platform` label instead.

**This is a skeleton.** Every package folder has a `README.md` that says what it does and what goes in it; the platform team writes the code. Rules: [CLAUDE.md](CLAUDE.md). How it fits together: [ARCHITECTURE.md](ARCHITECTURE.md).

| Folder | Package | Purpose |
|---|---|---|
| [`core/`](core/README.md) | `@sdm/core` | Contract, simulation contract, Simulation + replays, client core |
| [`host/`](host/README.md) | `@sdm/host` | Colyseus + Express game server host |
| [`gateway/`](gateway/README.md) | `@sdm/gateway` | The one public address, a path per game |
| [`template/`](template/README.md) | `@sdm/template` | Reference game that teams copy to `games/team-N/` |
| [`tooling/`](tooling/README.md) | `@sdm/tooling` | Shared TypeScript config, scripts and checks |
| [`docs/`](docs/README.md) | – | Platform documentation |

## Build order

Each step is its own `platform` issue and PR. The game teams can start on their game rules (`games/team-N/shared/`) as soon as step 3 is merged.

1. **Workspace** at the repo root: `package.json` (pnpm, Node 22), `pnpm-workspace.yaml` (`server/*`, `games/*`), TypeScript and lint/format config, `.gitattributes`, `.env.example`. Then `@sdm/tooling` with the shared `tsconfig`.
2. **CI**: a GitHub Actions workflow that runs install, lint, typecheck, test and build on every PR.
3. **`@sdm/core`**: the contract (`shared`) and the simulation contract (`sim`).
4. **`@sdm/host`**: `startGameServer()`, `createGameRoom()`, `/health`, the join route.
5. **`@sdm/template`**: the smallest playable multiplayer game on top of 3 and 4. Teams copy it to `games/team-N/`.
6. **Deployment**: the Railway project `sdm2026-2` (development from the `development` branch), then `@sdm/gateway`, then production from `main`.
7. **The rest**: replays, bug reports, stats, the client core (prediction, interpolation, debug tools).
