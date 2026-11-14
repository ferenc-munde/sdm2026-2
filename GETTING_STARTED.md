# Getting started

This guide takes you from a fresh machine to your first merged pull request. It works the same on macOS, Windows and Linux.

The rules for working in this repo are in [CLAUDE.md](CLAUDE.md). The course rules (meeting room, tracking, evaluation) are in [course/README.md](course/README.md).

## 1. Install the tools

| Tool | Version | How |
|---|---|---|
| Git | any recent | [git-scm.com](https://git-scm.com/downloads) |
| Node.js | 22 LTS | [nodejs.org](https://nodejs.org/en/download) |
| pnpm | 10.x | `corepack enable`, or `npm install -g pnpm` |
| GitHub CLI (`gh`) | any recent | [cli.github.com](https://cli.github.com/), then `gh auth login` |
| VS Code | any recent | [code.visualstudio.com](https://code.visualstudio.com/) (recommended, not required) |
| Your AI coding agent | – | Claude Code, OpenAI Codex, GitHub Copilot in VS Code, … |

## 2. Get the repository

```bash
git clone https://github.com/ferenc-munde/sdm2026-2.git
cd sdm2026-2
```

The repository is a **skeleton**: folders with a `README.md` that says what belongs there. The platform team builds the workspace first (`package.json`, the `server/` packages, the template game). After that, `pnpm install` and `pnpm dev` work, and this guide is updated with the exact commands.

## 3. Find your way around

| Folder | What's in it | Owner (label) |
|---|---|---|
| `games/team-N/` | Your team's game | Team N (`team-N`) |
| `server/` | The shared platform: server host, contract, gateway, template game, tooling | Platform (`platform`) |
| `course/` | Course information and the team roster | Instructors (`team-instructor`) |

Work only in your own team's folder. To change anything else, open an issue that explains why, with the owning team's label.

How the system is built: [server/ARCHITECTURE.md](server/ARCHITECTURE.md).

## 4. Make your first change

Every change follows the same path: **issue → branch → commits → pull request → review → merge**. The full rules are in [CLAUDE.md](CLAUDE.md).

1. **Open an issue.** Title `[team-N] Short description`, one label (`team-N`), a goal and a "done when" checklist. Assign yourself.
2. **Create a branch** from your team's up-to-date feature branch (`Team_1_Feature` for Team 1, and so on; `platform` and `team-instructor` use `development`), named after the label and the issue:

   ```bash
   git switch Team_N_Feature
   git pull
   git switch -c team-N/42-short-description
   ```

3. **Commit** small, focused changes: `feat(team-N): add score display`, with `Refs #42` on its own line in the body.
4. **Test** your change, and write down how.
5. **Open a pull request into your team's `Team_N_Feature`**, never into `development`, `staging` or `main` (`platform` and `team-instructor`: into `development`). Title in the commit format, the same label as the issue, `Closes #42` in the description.
6. **Get a review** from a teammate, fix any comments, then merge and delete the branch.

## 5. Working with AI agents

The course is AI first, so expect agents to do much of the work. Point them at the rules:

- **Claude Code** reads [CLAUDE.md](CLAUDE.md) automatically, plus [server/CLAUDE.md](server/CLAUDE.md) when it works in `server/`.
- **Other agents** (Codex and others) read `AGENTS.md`, which points to `CLAUDE.md`.
- Ask agents to follow the issue → branch → PR workflow and to work only in your team's folder.
