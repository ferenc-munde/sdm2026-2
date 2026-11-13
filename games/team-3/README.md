# Team 3 — The Last Train

This folder holds the game of Team 3 (package `@team-3/game`, label `team-3`).

**The Last Train** is a co-operative, non-violent, online multiplayer game for 2–4 players. The players are the maintenance crew of a moving train: they carry coal, repair leaks and put out fires so the train reaches its destination before the hull fails.

- **Plan, scope, roles and backlog:** [PLAN.md](PLAN.md)
- **Project board:** <https://github.com/users/favyabils234-hash/projects/1>
- **Issues:** [`[team-3]` issues](https://github.com/ferenc-munde/sdm2026-2/issues?q=is%3Aissue+%22%5Bteam-3%5D%22)

## Team

| Developer | GitHub | Area |
|---|---|---|
| 1 | `Abmuminfav` | Core rules: contract, map, movement, journey, items |
| 2 | `favyabils234-hash` | Room, run flow, hazard director, release |
| 3 | `Main-66` | Client |
| 4 | `davidudo2005` | Stations and hazards |

## Working here

Pull requests from work branches go into `Team_3_Feature`, which is promoted to `development`, `staging` and then `main`. See [DEVELOPMENT.md](DEVELOPMENT.md#branches-and-ci).

Work only inside this folder unless an issue says otherwise. Start from the template game once the platform team has built it: the layout of a game package is in [server/template/README.md](../../server/template/README.md), the rules in [server/CLAUDE.md](../../server/CLAUDE.md).

Until the platform packages exist, the game rules are written in `shared/` as pure, deterministic functions with tests, so they can be wrapped in the platform's game definition later without being rewritten.
