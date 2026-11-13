# Team 2 — Work Division Plan (4 people × AI agents × platform stack)

Aligned with root `CLAUDE.md` (repo rules), `server/CLAUDE.md` (platform rules),
and `GETTING_STARTED.md`. Read those before this file — they override anything
written here. Built on three rules:

1. **Vertical slices through the sim/client seam** — each person owns one
   feature end-to-end: its pure rules module in `shared/` AND its client
   rendering. Nobody needs another person's file to finish their feature.
2. **Single file ownership** — every file has one owner; needs go through
   issues, never through editing someone else's file.
3. **Contract-first** — SPEC §8 (state schema + input contract) is the
   contract; A lands it first as working skeleton, all slices build on it.

---

## 1. Roles & ownership

Roster (from `course/teams.json`): **A = Zeyad** (`Zackaziko`), **B = Shahd**
(`shahdtamerr`), **C = Mahmoud** (`Ahmed-Mahmoud124`), **D = Rawan**
(`Rawan-Ahmed-Mohamed`). Swap roles freely — the letters are what matters.

| | **A — Spine & Contract** | **B — Tasks & UI** | **C — Players & Items** | **D — Sim, Stations & Hazards** |
|---|---|---|---|---|
| **Feature** | Package skeleton, GameDefinition wiring, journey/win-lose, map & camera | Task system both ends + HUD | Player & item feature both ends | Power/Pressure, stations, hazards both ends |
| **`shared/` (pure rules)** | `game.ts` (composition), `state.ts`, `input.ts` | `tasks.ts` + test | `items.ts` + test | `sim.ts` (incl. #77 speed model), `stations.ts`, `hazards.ts` + tests |
| **`client/`** | `net.ts`, join/lobby UI, `render.ts` (Three.js map, camera, doors) | `hud.ts` (checklist, train-on-track strip, win/lose) + `minigames/` | local input, player avatars/anims, item visuals | station visuals, hazard fx, darkness/audio |
| **Other** | `room/index.ts`, `server.ts`, `config/game.json`, `package.json` | — | — | — |
| **Issues** | #35, #37 + contract/journey/lobby (to open) | tasks+HUD (to open) | #39, #44, #40, #45 + items/death (to open) | sim/hazards/juice (to open) |

Cross-file *imports* are fine (any module may call `tasks.requestProgress` or
read state). Cross-file *edits* are not — need a change in someone else's
file? Open an issue assigned to its owner.

### Hot files (the usual clash sources)

| File | Owner | Everyone else |
|---|---|---|
| `shared/state.ts`, `shared/input.ts` (the contract) | A | Never edit — contract change → issue to A |
| `shared/game.ts` (composition root) | A | Feature modules hand over factory functions A wires in |
| `room/index.ts`, `server.ts`, `package.json`, `config/game.json` | A | Tuning value changes → issue to A |
| `client/render.ts` core loop | A | D adds fx hooks; C adds sprite hooks — via modules A imports |
| `client/hud.ts` | B | C/D consume via DOM ids/signals |
| `SPEC.md` | A | Change requests via issue |
| Platform `server/` | **nobody on team 2** | `platform`-labeled issues only |

## 2. How every person works (the runbook)

### One-time setup (from `GETTING_STARTED.md`)

```bash
# Node.js 22 LTS, pnpm 10 (corepack enable), gh CLI + gh auth login
git clone https://github.com/ferenc-munde/sdm2026-2.git
cd sdm2026-2
```

### Per task

```bash
# 1) issue exists first (or open it: [team-2] Short description, done-when checklist)
git switch main && git pull
git switch -c team-2/<issue#>-<short-description>

# 2) tell your AI agent (paste role prompt §5 + the agent prompt from SPEC §12)

# 3) run locally (after the template is copied to games/team-2/)
pnpm install
pnpm --filter @team-2/game dev    # client :5173 + server :2567
pnpm --filter @team-2/game test   # headless sim tests (vitest)

# 4) two browser tabs on :5173 = two players for manual testing

# 5) ship
git commit -m "feat(team-2): <imperative, lowercase, ≤72 chars>"   # Refs #N in body
gh pr create --fill                                               # Closes #N + how tested
```

- Reviewer = owner of any module touched; **everyone reviews ≥1 PR/day**.
- One PR per issue, `Closes #N`, same `team-2` label, delete branch after merge.
- **Never push to `main`.** Never force-push. Never patch `server/`.
- **Check `.gitignore` before the first commit of every new package** —
  team-3's first PR accidentally added `node_modules/` (PR #42); committing
  build output breaks the repo rules and the review.
- Blocked >30 min? Post in the Meet room, pair on it.

### AI-agent notes (important)

- Claude Code reads root `CLAUDE.md` + `server/CLAUDE.md` automatically; other
  agents read `AGENTS.md` (pointing to `CLAUDE.md`). Point every agent at
  `games/team-2/SPEC.md` + `WORKFLOW.md` too.
- Colyseus 0.18 differs from everything agents remember: force them to check
  `docs.colyseus.io` (append `.md` for raw markdown) or install the skill:
  `npx skills add colyseus/skill`.
- Platform packages (`@sdm/core`, `@sdm/host`) are skeletons until the platform
  team merges their build order (see `server/README.md`): teams can start on
  `games/team-2/shared/` rules **as soon as step 3 (@sdm/core) merges**.

## 3. Schedule (2-day hackathon)

### Phase 0 — Spine (Day 1, first hours) — *serial-ish, blocks the rest*
- **A:** docs PR = SPEC + WORKFLOW (mergeable *now*, no platform needed — that's
  PR #75). File the `[platform]` needs issue (#73) immediately.
  When platform step 3 lands → PR: `shared/` state schema + input contract +
  GameDefinition wiring with stub feature modules (#64). When step 5 lands →
  PR: copy template → `@team-2/game`, `config/game.json`, `room/index.ts` (#35).
- **B/C/D (don't wait for code):** design refinement in issue comments:
  B: task rules + minigame parameter tables (#65, #76); C: input/anim list
  (#39, #40); D: power/pressure/hazard tuning tables + station layout
  coordinates (#68, #69). Draft module APIs in their own stub files (merge
  after #64).

### Phase 1 — Vertical slices (Day 1 afternoon → evening) — all parallel
- **B:** `shared/tasks.ts` + vitest (#65), HUD checklist + train-on-track strip (#78), minigames (#76).
- **C:** input → server movement + client interpolation (#39/#45), `shared/items.ts` + visuals (#67), interaction system (#40).
- **D:** `shared/sim.ts` power/pressure + speed model (#68, #77), `stations.ts`, start `hazards.ts` (#69).
- **A:** contract (#64), journey/phases/win-lose (#66), carriage map + doors + camera (#37), lobby (#70).

### Checkpoint (Day 1, evening) — **Integrator: A**
2 browser clients + dev server: join lobby → start → move → remote players
interpolate → boiler task spawns → completes → gauges move. Cross-module bugs
→ issues assigned to module owners; **nobody fixes files they don't own.**

### Phase 2 — Depth & polish (Day 2)
- **D:** full HazardDirector + hazard visuals (#69), juice (#72).
- **C:** death/elimination + spectator (#71), item edge cases.
- **B:** endgame sequence + minigame variety (#76 follow-ups).
- **A:** fail states, door sync, server tests for all rules, lobby → run flow (#66, #70).
- All: rotating playtests; every bug = issue with `done when`.
- Final hours: demo run recorded, `main` runs end-to-end, CI green.

## 4. Testing culture (course rule: "Test everything")

- Every rules PR ships a vitest test driving the headless Simulation
  (`@sdm/core/server`): join room → send input → assert state. Deterministic
  seeds make flaky tests impossible.
- Client PRs: PR body must say how it was tested (two-tab co-op walkthrough).
- CI (platform step 2) must be green on every PR; until it exists, run
  `pnpm -r typecheck && pnpm -r test` locally before requesting review.

## 5. Ready-to-paste role prompts

**A:**
> You own the contract and the spine of `games/team-2/`: `shared/game.ts`,
> `shared/state.ts`, `shared/input.ts`, `room/index.ts`, `server.ts`,
> `package.json`, `config/game.json`, and on the client `net.ts`, the
> lobby/join UI, and `render.ts` (map, camera, doors). You wire other roles'
> feature-module factories into the GameDefinition; never implement their
> logic. Follow root `CLAUDE.md` + `server/CLAUDE.md` exactly (Conventional
> Commits, branch names, no direct pushes, determinism rules). State/input
> contract changes go through you, via reviewed SPEC updates.

**B:**
> You own `shared/tasks.ts` (+ vitest) and `client/hud.ts`. Build the
> director-driven task system per SPEC §4/§9 (paced spawning, concurrency cap,
> endgame gating) and the HUD that renders state (keyed DOM rows, no rebuild
> race; top strip; win/lose screens). Consume A's state via schema callbacks;
> never edit `game.ts`, `state.ts`, `render.ts` or other roles' files.

**C:**
> You own `shared/items.ts` (+ test) and the client-side player & item visuals
> (`client/` input handling, sprites/anims, carry/toss fx). Movement is
> server-simulated from `move` inputs (SPEC §8.3) — implement prediction with
> `@sdm/core/client`, remote interpolation, and item pickup/drop/toss rules
> with server-side distance checks. Never edit the contract or `render.ts` core.

**D:**
> You own `shared/sim.ts`, `shared/stations.ts`, `shared/hazards.ts` (+ tests)
> and the client station/hazard visuals. Implement the fixed-tick
> Power/Pressure sim, station interaction handlers, and hazards as state
> entities (SPEC §3/§6). Determinism rules are hard requirements: SeededRandom,
> tick counts not wall-clock, zod-validated inputs, tuning in `config/game.json`
> (via A). Never edit `game.ts`, the contract, or other roles' files.
