# Repository rules

> This file is the single source of truth for how everyone (humans and AI agents) works in this repository. `AGENTS.md` only points here. Change the rules here, through a reviewed PR.

These rules apply to every agent and every human working in this repository. If a change does not follow this workflow, it does not get merged.

**This repository is a skeleton.** The folders and the `README.md` files in them describe how the system is built. The code is written by the teams during the hackathon, issue by issue. Where a rule mentions something that does not exist yet (a command, a check, a deployment), the platform team builds it; until then, follow the rule by hand.

## Repository layout

| Folder          | Owner       | Label             |
|-----------------|-------------|-------------------|
| `games/team-1/` | Team 1      | `team-1`          |
| `games/team-2/` | Team 2      | `team-2`          |
| `games/team-3/` | Team 3      | `team-3`          |
| `server/`       | Platform    | `platform`        |
| `course/`       | Instructors | `team-instructor` |

Work inside your own team's folder. Changes to another team's folder or to the shared folders need an issue that says why, on a line of its own (`Cross-team: <why>`), and a review from someone on the owning team.

`team-instructor` is reserved for the instructors listed in [`course/teams.json`](course/teams.json). Everybody else, AI agents included, uses their own team label.

## Tech stack

Everyone uses the same stack. Don't introduce alternatives without an issue that explains why.

- **Language:** TypeScript everywhere, in one pnpm workspace. Team 1 may use plain JavaScript (#48).
- **Frontend:** Vite + TypeScript, one app per team in `games/team-N/` (started from `server/template/` once the platform team has built it).
- **Multiplayer:** Colyseus 0.18 on the server, `@colyseus/sdk` in the clients. Colyseus 0.18 changed many APIs: read [server/CLAUDE.md](server/CLAUDE.md) before writing Colyseus code.
- **Hosting:** Railway, set up by the platform team (see [server/ARCHITECTURE.md](server/ARCHITECTURE.md)).

How the pieces fit together: [server/ARCHITECTURE.md](server/ARCHITECTURE.md).

## Workflow

Every change goes through the same path: **issue → branch → commits → pull request → review → merge.** No shortcuts.

### Branches

Work moves in one direction only, one pull request per step:

```
team-N/<issue>-<description>  →  Team_N_Feature  →  development  →  staging  →  main
```

| Branch | What it is | Changes through |
|---|---|---|
| `team-N/<issue>-<description>` | Short-lived work branch for one issue | Your commits |
| `Team_N_Feature` | Team N's own integration branch (`Team_1_Feature` … `Team_3_Feature`) | PRs from that team's work branches |
| `development` | Integration branch for all teams | PRs from `Team_N_Feature`, and from `platform` and `team-instructor` work branches |
| `staging` | Release candidate | PRs from `development` only |
| `main` | Production (prod): the stable, released state | PRs from `staging` only, merged by an instructor |

- A game team's work branch never targets `development`, `staging` or `main` directly: it goes into the team's `Team_N_Feature`.
- `platform` and `team-instructor` have no feature branch: their work branches start from `development` and their PRs go into `development`.
- Keep `Team_N_Feature` up to date by merging `development` into it (a sync PR), never the other way round without a promotion PR.

### 1. Issue first

- Open an issue before writing any code. No issue, no branch, no PR.
- The issue carries exactly one team label: `team-1`, `team-2`, `team-3`, `platform` or `team-instructor`.
- The title starts with the team label: `[team-2] Add login page`.
- Describe what is changing and why, and what "done" looks like (a short checklist).

### 2. Branch

- Never commit directly to `main`, `staging`, `development` or a `Team_N_Feature` branch. They only change through merged pull requests.
- Branch from your team's up-to-date `Team_N_Feature` (`platform` and `team-instructor`: from `development`).
- Name the branch after the team label and the issue: `<team-label>/<issue-number>-<short-description>`, for example `team-2/14-add-login-page` or `platform/8-ci-checks`.

### 3. Commits

- One logical change per commit.
- Use [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): subject`, for example `feat(team-2): add login page`. Types: `feat`, `fix`, `docs`, `refactor`, `chore`, `ci`, `build`, `test`, `perf`. The scope is your team label.
- Subject in the imperative mood, lowercase, at most 72 characters, no trailing period.
- Reference the issue on its own line in the body: `Refs #14`.
- Never commit secrets, credentials, build output or large binaries.

### 4. Pull request

- One pull request per issue, into your team's `Team_N_Feature` (`platform` and `team-instructor`: into `development`).
- Promotion pull requests (`Team_N_Feature` → `development`, `development` → `staging`, `staging` → `main`) carry no new work: they only move what is already reviewed one step forward. Title: `chore(team-N): promote Team_N_Feature to development`.
- Only an instructor merges `staging` → `main`. A repository ruleset enforces it: `main` changes only through a pull request merged by the repository admin, and cannot be deleted or force-pushed. Anyone may open the promotion PR; an instructor reviews and merges it.
- The PR carries the same team label as its issue.
- The title follows Conventional Commits with the team label as the scope: `feat(team-2): add login page`.
- The description links the issue with a closing keyword (`Closes #14`) and says what changed and how it was tested.
- Keep the PR focused. Unrelated changes go in their own issue and PR.

### 5. Review and merge

- At least one approving review from someone other than the author before merging.
- Test everything: say in the PR how you tested it. Once CI exists, all checks must be green.
- Resolve every review comment before merging.
- The work branch is deleted automatically when its pull request is merged (the repository setting "Automatically delete head branches" is on). Do not delete it by hand, and do not reuse it: start the next issue from a fresh branch.
- Long-lived branches (`main`, `staging`, `development`, `Team_N_Feature`) are never deleted. They must stay protected so that promotion and sync PRs, which use them as their head branch, cannot remove them.

## Grades

When someone asks about their grade or points, run `node course/tooling/student-report.mjs --me` (or `--student <github-login>`) on an up-to-date `development` branch and explain its output. The rules are in [course/README.md](course/README.md#check-your-own-grade). Never commit the output: it has per-person numbers.

## Deployment

Nothing is deployed yet. Railway belongs to the platform team: teams don't create or change Railway services, variables or domains; they open a `platform` issue instead. The target setup (one gateway, one service per game, the `development` branch deploys to the development environment, `main` to production) is in [server/ARCHITECTURE.md](server/ARCHITECTURE.md). Secrets live only in Railway variables, never in the repository.

## Never

- Push directly to `main`, `staging`, `development` or a `Team_N_Feature` branch.
- Open a pull request that skips a step (for example a work branch or `Team_N_Feature` straight into `main`).
- Force-push to `main`, `staging`, `development`, a `Team_N_Feature` branch or someone else's branch.
- Merge a PR without a team label, a linked issue or an approving review.
- Rewrite history that others have already pulled.
