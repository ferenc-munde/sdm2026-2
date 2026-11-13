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

## Run locally

```bash
npm install
npm run dev      # client on :5173: 2D train map + HUD + ticking local state
npm test         # headless rules tests (deterministic sim)
npm run typecheck
npm run build    # typecheck + client build to client/dist/ (Vite root is client/)
npm run preview  # serve the client build
```

> There is no server yet — the platform host is stalled (#73). The client
> plays against a **local state adapter** (`client/stateModel.ts`) that drives
> the real GameDefinition headless; when the platform lands, that one file is
> swapped for `net.ts` + the Colyseus join (team-3 precedent).

On Windows PowerShell, use `npm.cmd` if `npm.ps1` is blocked. Use Node 22 LTS.
The map is flat 2D, displayed by Three.js with five vertical carriages, 20
station locations, four passages, scrolling scenery and a carriage inspector.
Crew artwork is still static: queued movement inputs are not a completed
player movement feature.

The **Local rules** mode displays actual state from the adapter and keeps
WASD/arrows, E pickup and Q drop input wiring. Current rule modules are partly
stubs, so speed, tasks and journey may not advance even while ticks increase.
The countdown uses elapsed run ticks and the configured tick rate.

Choose **Scene preview** to use the separate example controls: repair,
journey/time, speed (0–2x), pause, victory, defeat and reset. These controls
never modify the adapter state. Switch back to Local rules to see live state.
The standalone HUD preview is also available with `node client/preview-hud.mjs`
on port 5174. Neither mode connects multiple browser tabs as network players.

Two browser tabs at `localhost:5173` = two players, once real networking
lands (#70).

## Workflow (repo rules — see root `CLAUDE.md`)

1. **Issue first** — `[team-2] Short description`, goal + `done when`, label `team-2`, assignee.
2. Branch `team-2/<issue#>-<short-description>` from up-to-date `Team_2_Feature`.
3. Conventional Commits: `feat(team-2): add boiler station` + `Refs #N` in the body.
4. One PR per issue, `Closes #N`, say how you tested it; ≥1 approving review; delete branch after merge.
5. Never push to `main`. Platform needs → `platform`-labeled issue, never patch `server/`.
