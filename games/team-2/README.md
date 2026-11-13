# Team 2 — Last Train

This folder holds the game of Team 2 (package `@team-2/game`, label `team-2`).

Work only inside this folder unless an issue says otherwise. The package was self-scaffolded (mirroring [server/template/README.md](../../server/template/README.md)) until the platform lands: the rules are in [server/CLAUDE.md](../../server/CLAUDE.md), build details in `DEVELOPMENT.md`.

## Game

5-carriage co-op survival train. One **Colyseus 0.18 authoritative server** per team package, one **Vite + TypeScript browser client**, deterministic simulation (replayable), rendered with **Three.js** + DOM HUD (Among-Us-style task minigames, timed journey with a train-on-a-track strip).

- `SPEC.md` — game design, state schema, input contract, issue list (source of truth)
- `WORKFLOW.md` — who owns what, runbook, schedules, agent role prompts

## Prerequisites

- Node.js 22 LTS, pnpm 10 (`corepack enable`)
- Your AI agent of choice (see `WORKFLOW.md` §2)
- GitHub CLI (`gh`) is **optional** — handy for issues/PRs from the terminal,
  but the web UI works fine; nothing in the run steps needs it

## Run the local Three.js scene

From `games/team-2/`, run `npm.cmd install`, then `npm.cmd run dev`.
Open the address printed in the terminal (normally http://127.0.0.1:5173/).
The scene uses flat 2D top-down artwork with a Three.js orthographic camera,
five vertical carriages, forest tracks, and the HUD. Buttons change example data only; the crew artwork is a static
placeholder. There is no player movement, repair minigame, or multiplayer yet.
Scenery now scrolls past the train. Use the demo speed slider (0–2x) and
Pause scenery to test the effect. Victory/defeat stop the scenery, and Reset
demo restores 1x. These controls do not calculate gameplay speed or advance
the game clock; real speed will come from the rules/network integration.
`npm.cmd run build` checks TypeScript and builds the browser app into `dist/`.
`npm.cmd run preview` serves that build locally.

The standalone task-panel preview remains available with
`node client/preview-hud.mjs` on port 5174.

## Multiplayer (once the platform template is copied here)

```bash
pnpm install
pnpm --filter @team-2/game dev   # client on :5173, server on :2567
pnpm --filter @team-2/game test  # headless rules tests (deterministic sim)
```

> The local `dev` command currently starts the browser scene only. The
> multiplayer server still depends on the platform host/template (#73).

Two browser tabs at `localhost:5173` = two players.

## Workflow (repo rules — see root `CLAUDE.md`)

1. **Issue first** — `[team-2] Short description`, goal + `done when`, label `team-2`, assignee.
2. Branch `team-2/<issue#>-<short-description>` from up-to-date `main`.
3. Conventional Commits: `feat(team-2): add boiler station` + `Refs #N` in the body.
4. One PR per issue, `Closes #N`, say how you tested it; ≥1 approving review; delete branch after merge.
5. Never push to `main`. Platform needs → `platform`-labeled issue, never patch `server/`.
