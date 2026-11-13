# Team 2 — Last Train

This folder holds the game of Team 2 (package `@team-2/game`, label `team-2`).

Work only inside this folder unless an issue says otherwise. Start from the template game once the platform team has built it: the layout of a game package is in [server/template/README.md](../../server/template/README.md), the rules in [server/CLAUDE.md](../../server/CLAUDE.md).

## Game

5-carriage co-op survival train. One **Colyseus 0.18 authoritative server** per team package, one **Vite + TypeScript browser client**, deterministic simulation (replayable), rendered with **Three.js** + DOM HUD (Among-Us-style task minigames, timed journey with a train-on-a-track strip).

- `SPEC.md` — game design, state schema, input contract, issue list (source of truth)
- `WORKFLOW.md` — who owns what, runbook, schedules, agent role prompts

## Prerequisites

- Node.js 22 LTS, pnpm 10 (`corepack enable`)
- GitHub CLI (`gh`) + `gh auth login` for issues/PRs
- Your AI agent of choice (see `WORKFLOW.md` §2)

## Run locally (once the platform template is copied here)

```bash
pnpm install
pnpm --filter @team-2/game dev   # client on :5173, server on :2567
pnpm --filter @team-2/game test  # headless rules tests (deterministic sim)
```

Two browser tabs at `localhost:5173` = two players.

## Workflow (repo rules — see root `CLAUDE.md`)

1. **Issue first** — `[team-2] Short description`, goal + `done when`, label `team-2`, assignee.
2. Branch `team-2/<issue#>-<short-description>` from up-to-date `main`.
3. Conventional Commits: `feat(team-2): add boiler station` + `Refs #N` in the body.
4. One PR per issue, `Closes #N`, say how you tested it; ≥1 approving review; delete branch after merge.
5. Never push to `main`. Platform needs → `platform`-labeled issue, never patch `server/`.
