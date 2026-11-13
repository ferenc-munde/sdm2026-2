# The Last Train — project plan (Team 3)

A co-operative, non-violent, online multiplayer game for 2–4 players. The players are the maintenance crew of a moving train. They carry coal, repair leaks and put out fires so the train reaches its destination before the hull fails. Nobody fights anybody; the team wins or loses together.

This plan covers 12–15 working hours for four developers. It is planned to 12 hours, with the rest as buffer.

## 1. Decisions

| Decision | Choice | Reason |
|---|---|---|
| Platform | Browser game on the shared course platform, not Godot | The repository rules fix the stack for every team: TypeScript, Vite and Colyseus, hosted by the platform team. The game design from the idea document is kept unchanged. |
| Starting point | A copy of the platform template (`server/template/`), once the platform team has built it | It will provide rooms with join codes, the fixed tick, reconnection, replays and deployment. We only write the game. |
| Until then | Pure rules in `shared/` with their own tests | The platform is being built during the hackathon. Rules written as pure, deterministic functions (no `Math.random()`, no clock) can be wrapped in the platform's game definition later without a rewrite. |
| Authority | The server simulates everything, including movement | This is how the platform works: clients send inputs, never state. The rules can be tested without a browser. |
| Client | Vite + Three.js | Requested by the platform team. The train is drawn as simple 3D boxes seen from above at an angle, which gives the cutaway look of the idea document without any art assets. |
| Tests | Vitest on the shared rules | The rules are one pure game definition (`createState`, `join`, `leave`, `step`) with a seeded random generator, so every test is repeatable. |
| Map | The train only | Ship, plane and spaceship are out of scope. |

## 2. Scope

**Must build (the game):**

- Create a room and join it with a short code; 2–4 players.
- Walk around a three-car train with walls and narrow doors.
- Journey model: fuel drains, speed depends on fuel, distance grows, hull drops while hazards are active.
- Carry one item at a time: coal, wrench, extinguisher.
- Refuel the engine with coal.
- Hull breach: hold the wrench on it for 3 seconds.
- Fire: hold the extinguisher on it for 2.5 seconds. A fire on the engine stalls the train.
- Hazard director: a new hazard every 12 seconds, every 7 seconds in the last third of the journey.
- Heads-up display: hull, fuel, distance.
- Win and lose screens with "play again".
- Online from a link.

**Only if time, in this order:**

1. Course hazard: a warning, then someone must hold the steering console or the hull takes a hit.
2. Throwing items across the gap between cars.
3. Fire spreads after 15 seconds.
4. Sound effects.
5. AI conductor: short generated announcements about what is going wrong.

**Not this weekend:** other vehicles, accounts, leaderboards, character customisation, mobile controls.

## 3. Game numbers (from the idea document)

| Value | Number |
|---|---|
| Hull | 100, lose at 0 |
| Target distance | 1800 units, win when reached (about 3 minutes at full speed) |
| Full speed | 10 units per second |
| Fuel drain | 1.8 per second; one coal adds 35 |
| Speed factor | 1.0 above 25 fuel; 0.5 at 25 or below; 0 at empty or when the engine is on fire |
| Hull loss | 2.5 per second per breach, 1.5 per second per fire |
| Repair times | Breach 3.0 s with wrench, fire 2.5 s with extinguisher |
| Hazard interval | 12 s, then 7 s once more than 65% of the distance is covered |

## 4. Folder layout

Everything lives in `games/team-3/`, in the layout of the platform template.

```
games/team-3/
├── package.json      name: @team-3/game
├── server.ts         starts the game server (from the template)
├── config/game.json  tick rate, maximum players, reconnect time
├── shared/           the game definition: state, inputs, rules (pure, tested)
│   └── hazards/      breach, fire, hazard director
├── room/             connects the game definition to the platform room
└── client/           Three.js scene, input, screens
```

## 5. Roles

Each person owns one area, so two people rarely edit the same file.

| Person | Area | Owns |
|---|---|---|
| **Developer 1 — core rules** (`Abmuminfav`) | `shared/` (contract, `map/`, `movement/`, `journey/`, `items/`) | State and input types, map data, movement, journey model, carrying and throwing items |
| **Developer 2 — room and run flow** (`favyabils234-hash`) | `room/`, `config/`, `shared/run/` | Package setup, room wiring, run phases, hazard director, difficulty scaling, leaving and rejoining, release, contact with the platform team |
| **Developer 3 — client** (`Main-66`) | `client/` | Drawing, input, lobby, heads-up display, end screens, scenery, sound |
| **Developer 4 — stations and hazards** (`davidudo2005`) | `shared/stations/`, `shared/hazards/` | Coal dispenser and refuelling, breach, fire, spreading fire, course hazard, how-to-play, AI conductor |

**Reviews rotate:** Developer 2 reviews Developer 1, Developer 3 reviews Developer 2, Developer 4 reviews Developer 3, Developer 1 reviews Developer 4. Everybody reviews the shared contract (task 3).

## 6. Timeline

| Phase | Hours | Goal | Done when |
|---|---|---|---|
| 0. Setup | 0–1 | Issues filed, board set up, contract agreed | Issues 1–3 merged; platform question asked |
| 1. Walking skeleton | 1–4 | Players move in the train together | Three browsers see each other walk |
| 2. Core loop | 4–8 | The whole game is playable | A full run can be won and lost; game is online |
| 3. Complete | 8–10.5 | It feels like a finished game | Rooms, restart and disconnects all work |
| 4. Stretch | 10.5–12 | "If time" items, one at a time | Each merged with tests, or not started |
| 5. Freeze | last 90 min | Bug fixes only | Every issue closed or marked not done |

**Checkpoints.** At the end of each phase the four of us play the current build together for five minutes. If a phase is more than one hour late, we drop the lowest stretch item rather than extend.

**Day split.** Friday ends after phase 2: the game is playable online. Saturday is phases 3–5.

## 7. Backlog

The tasks are filed as GitHub issues #3 to #32: plan task N is issue #(N + 2), so task 1 is #3 and task 30 is #32.

Each line is one GitHub issue titled `[team-3] <title>`, labelled `team-3`, assigned to its owner, and closed by one small pull request with tests.

### Phase 0 — setup

| # | Title | Owner | Done when |
|---|---|---|---|
| 1 | Add project plan and README | Dev 2 | Plan and run instructions are in the team folder |
| 2 | Project skeleton: `@team-3/game` package with the template layout and a test runner | Dev 2 | `shared/`, `room/`, `client/` and `config/` exist; the tests run with one command; one passing test; README says how to run them |
| 3 | Shared contract: state types, messages, constants | Dev 1 | Types compile; constants match section 3; the whole team approved |

### Phase 1 — walking skeleton

| # | Title | Owner | Done when |
|---|---|---|---|
| 4 | Train map data: cars, walls, doors, station positions | Dev 1 | Map loads; test checks doors connect the cars |
| 5 | Player movement with wall collision | Dev 1 | Tests: moves in 8 directions, stops at walls, passes doors |
| 6 | Room setup: 2 to 4 players, join by code (provided by the platform) | Dev 2 | `config/game.json` allows 4 players; test: a fifth player is refused; joining by code works |
| 7 | Run phases in the game definition: lobby, running, finished | Dev 2 | Tests: the run starts when the players are ready; a replay of a run gives the same state |
| 8 | Three.js renderer: train cutaway and players | Dev 3 | A Three.js scene shows the train from above at an angle, with coloured players and names |
| 9 | Keyboard input sent to the server | Dev 3 | WASD and arrow keys move your player |
| 10 | Lobby screen: name, create room, join with code | Dev 3 | Two browsers end up in the same room |

### Phase 2 — core loop

| # | Title | Owner | Done when |
|---|---|---|---|
| 11 | Journey model: fuel, speed, distance, hull, win and lose | Dev 1 | Tests cover every row of section 3 |
| 12 | Carry items: pick up and drop, one per player | Dev 1 | Tests: two players grabbing one item, only one gets it |
| 13 | Coal dispenser and engine refuelling | Dev 4 | Test: delivering coal adds 35 fuel and uses the coal |
| 14 | Hull breach: repair by holding the wrench | Dev 4 | Tests: 3 s repair, progress resets if released, needs wrench |
| 15 | Fire: put out with the extinguisher; engine fire stalls the train | Dev 4 | Tests: 2.5 s, needs extinguisher, speed 0 while engine burns |
| 16 | Hazard director: timed random hazards | Dev 2 | Tests: 12 s interval, 7 s after 65%, never on a busy spot |
| 17 | Draw items, stations, hazards and repair progress | Dev 3 | Every object in the state is visible |
| 18 | Heads-up display: hull, fuel, distance | Dev 3 | Bars follow the server state; fuel bar changes colour when low |
| 19 | Win and lose screens with "play again" | Dev 3 | Both screens appear; play again restarts the room |
| 20 | Put the game online through the platform | Dev 2 | The game runs on the platform host; a `platform` issue adds team 3 to the game list; the game works under `/team-3` |

### Phase 3 — complete

| # | Title | Owner | Done when |
|---|---|---|---|
| 21 | Handle players leaving and rejoining | Dev 2 | Tests for `leave`, `disconnect` and `reconnect`: a dropped player's item falls; a returning player gets their seat back |
| 22 | Scale difficulty to the number of players | Dev 2 | Test: hazard interval changes with 2, 3, 4 players |
| 23 | Scrolling background that follows train speed | Dev 3 | Background slows at low fuel and stops when stalled |
| 24 | How-to-play screen and control hints | Dev 4 | A new player can start without being told the keys |
| 25 | Play-test fixes | all | Bugs found in the checkpoint play-test are closed |

### Phase 4 — stretch, in order

| # | Title | Owner |
|---|---|---|
| 26 | Course hazard and steering console | Dev 4 rules, Dev 3 warning |
| 27 | Throw items between cars | Dev 1 |
| 28 | Fire spreads after 15 seconds | Dev 4 |
| 29 | Sound effects | Dev 3 |
| 30 | AI conductor announcements | Dev 4 |

## 8. Working rules

The repository rules in the root `CLAUDE.md` and `GETTING_STARTED.md` apply. In short:

- **Issue first.** No branch without an issue. Branch name: `team-3/<issue number>-<short-name>`, created from an up-to-date `main`.
- **One issue, one pull request, into `main`.** Aim for under 200 changed lines. The title uses the commit format, for example `feat(team-3): add fire hazard`. The description says what changed and how it was tested, and ends with `Closes #<number>`.
- **Commits** use `type(team-3): subject` with `Refs #<number>` in the body.
- **Run the tests before pushing.** Once the platform has continuous integration, every check must be green.
- **Tests with every rule change.** Client-only drawing changes say how they were checked by hand.
- **Review within 15 minutes.** A waiting review comes before starting new work.
- **Contract changes are announced.** Anything in the shared state or inputs is agreed by the whole team before it is merged.
- **Stay in `games/team-3/`.** Anything needed from the platform team is an issue with the `platform` label.

## 9. Open points and risks

| Risk | Action | Owner |
|---|---|---|
| The platform is only a skeleton: the workspace, `@sdm/core`, `@sdm/host` and the template are still to be built by the platform team | Write rules and tests that do not depend on the platform; follow the platform pull requests and wire the game into the room as soon as `@sdm/core` and `@sdm/host` are merged | Dev 2 |
| The platform is not ready in time | The rules, tests and client still count as delivered work; ask the platform team early which parts they will finish | Dev 2 |
| Code written before the template lands uses a different folder layout | Move it into `shared/` and shape it as the game definition when the skeleton is merged | Dev 1 |
| The platform needs Node.js 22 and pnpm 10.28.0 | Everyone installs them before the skeleton lands | all |
| Merge conflicts in shared files | One owner per folder; contract merged first | Dev 1 |
| Too many features | Stretch items start only when phases 0–3 are merged | all |
| One person blocked | Raise it at once; the reviewer of that area pairs for 15 minutes | all |
