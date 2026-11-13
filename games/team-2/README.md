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
npm run dev      # local harness: client on :5173 (placeholder scene + ticking state)
npm test         # headless rules tests (deterministic sim)
npm run build    # client build to dist/ (what CI runs)
```

> There is no server yet — the platform host is stalled (#73). The client
> plays against a **local state adapter** (`client/stateModel.ts`) that drives
> the real GameDefinition headless; when the platform lands, that one file is
> swapped for `net.ts` + the Colyseus join (team-3 precedent).

Two browser tabs at `localhost:5173` = two players, once real networking
lands (#70).

## Workflow (repo rules — see root `CLAUDE.md`)

1. **Issue first** — `[team-2] Short description`, goal + `done when`, label `team-2`, assignee.
2. Branch `team-2/<issue#>-<short-description>` from up-to-date `main`.
3. Conventional Commits: `feat(team-2): add boiler station` + `Refs #N` in the body.
4. One PR per issue, `Closes #N`, say how you tested it; ≥1 approving review; delete branch after merge.
5. Never push to `main`. Platform needs → `platform`-labeled issue, never patch `server/`.
