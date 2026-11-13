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

### 1. Issue first

- Open an issue before writing any code. No issue, no branch, no PR.
- The issue carries exactly one team label: `team-1`, `team-2`, `team-3`, `platform` or `team-instructor`.
- The title starts with the team label: `[team-2] Add login page`.
- Describe what is changing and why, and what "done" looks like (a short checklist).

### 2. Branch

- Never commit directly to `main`. It only changes through merged pull requests.
- Branch from an up-to-date `main`.
- Name the branch after the team label and the issue: `<team-label>/<issue-number>-<short-description>`, for example `team-2/14-add-login-page` or `platform/8-ci-checks`.

### 3. Commits

- One logical change per commit.
- Use [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): subject`, for example `feat(team-2): add login page`. Types: `feat`, `fix`, `docs`, `refactor`, `chore`, `ci`, `build`, `test`, `perf`. The scope is your team label.
- Subject in the imperative mood, lowercase, at most 72 characters, no trailing period.
- Reference the issue on its own line in the body: `Refs #14`.
- Never commit secrets, credentials, build output or large binaries.

### 4. Pull request

- One pull request per issue, into `main`.
- The PR carries the same team label as its issue.
- The title follows Conventional Commits with the team label as the scope: `feat(team-2): add login page`.
- The description links the issue with a closing keyword (`Closes #14`) and says what changed and how it was tested.
- Keep the PR focused. Unrelated changes go in their own issue and PR.

### 5. Review and merge

- At least one approving review from someone other than the author before merging.
- Test everything: say in the PR how you tested it. Once CI exists, all checks must be green.
- Resolve every review comment before merging.
- Delete the branch after it is merged.

## Deployment

Nothing is deployed yet. Railway belongs to the platform team: teams don't create or change Railway services, variables or domains; they open a `platform` issue instead. The target setup (one gateway, one service per game, `main` → development, `prod` → production) is in [server/ARCHITECTURE.md](server/ARCHITECTURE.md). Secrets live only in Railway variables, never in the repository.

## Never

- Push directly to `main`.
- Force-push to `main` or to someone else's branch.
- Merge a PR without a team label, a linked issue or an approving review.
- Rewrite history that others have already pulled.
