# Last Train — Expanded Specification (v4, platform stack)

> 5-carriage co-op survival train. Built on the course platform: **Colyseus 0.18
> authoritative server + deterministic, replayable `GameDefinition` + Vite
> TypeScript browser client (Canvas2D render, DOM HUD)**. Strictly TypeScript
> in a pnpm workspace. This file is the single source of truth for the coding
> agent and for issue scoping. Pair with `WORKFLOW.md` (who does what).
>
> **Read first:** root `CLAUDE.md` (repo rules), `server/CLAUDE.md` (platform
> rules + Colyseus 0.18 warnings), `server/ARCHITECTURE.md`, `server/AGENTS.md`.

---

## 1. Game loop, win & lose conditions

One run = one **race against a time limit** over a fixed distance. The train
travels while a difficulty director injects minigame tasks and hazards; speed
is affected by task/hazard state (§3). The sim advances in fixed ticks
(`config/game.json`: `tickRate`, `timeLimitSeconds`); all timing is tick
counts — never wall-clock.

- **Win:** arrive (distance = 100%) before the time limit **and** complete the
  final task `Pull emergency brake to dock safely` → **Docked Safe** screen
  with per-team stats (tasks completed, fires fought, deaths).
- **Lose (any of):**
  - **Missed deadline:** the time limit passes before arrival — the train
    stalls short of the station or crashes at speed.
  - **Boiler overload:** Pressure ≥ 100% for 10 uninterrupted seconds → boiler
    explosion, run over.
  - **Cold stall:** Power at 0% with no emergency generator running for 30s →
    brakes seize, train derails at the next junction warning.
  - **Crew wipe:** all players eliminated.
- Room `phase` (in state): `lobby → running → won | lost`.

HUD top strip: a **train-on-a-track visual** instead of a plain bar — the
mini-train's position is the journey distance, a **schedule ghost** marker
shows the minimum pace to arrive in time (falling behind turns the strip
red), plus the deadline countdown, Power %, Pressure %, and one alarm icon
per car.

## 2. Vehicle architecture (5 carriages)

Linear assembly of 5 carriages joined by bulkhead doors, laid out side by side
in one world; the camera follows the local player and shows ~2 cars. Cars are
drawn in a fixed z-order (players above props, props above floors).

| Car | Name | Stations | Purpose |
| --- | --- | --- | --- |
| 1 | Command & Guidance Deck | Dual nav consoles, emergency brake lever, route-map table | Course corrections, code-entry tasks, endgame brake |
| 2 | Core Propulsion & Boiler Room | Boiler, high-pressure intake valves, furnace fuel slot | Highest-traffic danger zone; Power & Pressure live here |
| 3 | Mechanical & Hydraulic Junction | Breaker box, pipe junction, coolant pump, tool lockers (Wrench, Extinguisher) | Leaks & electrical fires spawn here; transit hub |
| 4 | Cargo & Storage Hold | Crate dispenser bins (Coal, Spare Parts, Batteries), spare fuses, extinguisher refill dock | Logistics hub — everything heavy starts here |
| 5 | Caboose & Emergency Generator | Backup diesel generator crank, rear observation platform, track-switcher lever | Safety net: 60s emergency power; rear lever tasks |

### Emergency generator (Car 5)
Hold-interact crank with a stamina bar; drains 2× faster solo (balanced for two
players alternating). While cranking: 60s of emergency power, repeatable.

### Bulkhead lockdown relief
A locked bulkhead splits a linear train, so every lockdown has a relief: a
**floor crawl hatch** (slow, noisy, one player, 3s) and the door can be
**force-opened with the Wrench** after a 5s channel.

## 3. Simulation state (server-authoritative, deterministic)

All rules live in `games/team-2/shared/` as a pure `GameDefinition` from
`@sdm/core/sim` (`createState`, `init`, `join`, `leave`, `step`, commands).
The room shell (fixed tick, codes, reconnection, replay recording) comes from
`@sdm/host`'s `createGameRoom()` — we never write that ourselves.

- `power: 0..100` — drains by boilers idle/broken; < 15% = darkness event.
- `pressure: 0..100` — rises with fires/unsealed leaks; ≥ 100% starts the 10s
  overload fail countdown (klaxon + red vignette, driven from state).
- `journeyDistance: 0..1` — drives spawn pacing and the win check.
- `speed` — `base · f(power, pressure) · (1 − drag)`; **drag comes from every
  unfinished critical task and every active hazard** (tuning values in
  `config/game.json`). Staying above the required average speed
  (`distance / timeLimit`) means arriving in time; completing tasks restores
  speed — repairs literally move the train.
- **Difficulty & player-count scaling** (director inputs):
  `difficulty = elapsedTicks / timeLimitTicks` grows over the run, so
  `spawnInterval = lerp(25s → 8s, difficulty) / (1 + 0.3·(players−1))` and the
  concurrent cap is `players + 2`. More players → proportionally more tasks;
  later in the run → faster spawns, nastier hazards, longer minigames.
- Determinism rules (repo-mandated): `SeededRandom` from `@sdm/core/shared`
  (never `Math.random`), fixed ticks only (no `Date.now()` in the sim), every
  input zod-validated, tuning values in `config/game.json`.

## 4. Task library (12 tasks, director-driven)

Server-side director in `shared/tasks.ts` (pure, headless-testable):

- Registry of 12 definitions across 5 categories (Power, Pressure, Fire,
  Navigation, Cargo). Endgame tasks only when `journeyDistance >= 0.9`.
- Director (formulas in §3): interval from difficulty + player count, exclude
  currently active IDs, concurrent cap `players + 2`; prefer tasks matching
  current sim state.
- **Every task resolves through a minigame** (Among-Us style, #76): wires,
  valve sequence, slider calibration, hold-to-fill, keypad, tap-count.
  Completion sends `progress` inputs; minigame length scales with difficulty.

| Category | Task | Minigame | Resolution |
| --- | --- | --- | --- |
| Power | `Restore main power grid (0/1)` | valves → hold | Flip tripped breaker (Car 3) → restart boiler (Car 2) |
| Power | `Replace blown fuse in Cargo Hold (0/2)` | wires | Carry fuses Car 4 → Car 3 junction box, connect |
| Pressure | `Seal high-pressure steam leak (0/1)` | hold | Close red valve (Car 2), wrench-hold the burst pipe |
| Pressure | `Drain flooded bilge (0/1)` | hold | Sump pump (Car 3) held on for 5s |
| Fire | `Extinguish engine compartment fire (0/1)` | hold | Extinguisher Car 3 → Car 2, spray gauge |
| Fire | `Clear blocked ventilation vent (0/1)` | taps | Interact-tap debris in Car 4 vent |
| Navigation | `Calibrate track alignment coordinates (0/1)` | keypad | One player reads Car 1 papers, other enters the code |
| Navigation | `Engage manual track switcher lever (0/1)` | slider | Car 5 rear platform during junction warning |
| Cargo | `Secure loose cargo crates (0/2)` | hold | Re-fasten crates in Car 4 after rough-terrain shock |
| Cargo | `Load emergency backup battery (0/1)` | carry + hold | Heavy cell Car 5 → Car 1 aux console (−30% speed) |
| Endgame | `Purge coolant lines before docking (0/1)` | valves ×2 | Simultaneous 2-player interact on Car 2 + Car 3 |
| Endgame | `Pull emergency brake to dock safely (0/1)` | hold (crew) | All living crew in Car 1, hold interact on brake |

## 5. Player death & elimination

Eliminated by fire contact (3s exposure), boiler explosion blast, or
derailment impact. Eliminated players become spectators (free camera), flagged
in state (`eliminated`). No mid-run revival v1.

## 6. Hazard director (server)

- **Steam bursts / electrical arcing** → 15s bulkhead lockdown (with hatch/wrench relief, §2).
- **Spills:** dropped fuel/chemical items create slippery floor tiles until cleaned.
- **Darkness:** power < 15% kills interior lights; consoles glow; flashlight item.
- **Rough terrain shocks** (junctions) knock crates loose and can trip breakers.
- Hazards are entities in the Colyseus state (`hazards` map) — clients
  instantiate visuals on schema `onAdd` and destroy on `onRemove`.

## 7. Items

| Item | Where | Notes |
| --- | --- | --- |
| 🔧 Wrench | Car 3 lockers | Seals pipes, force-opens locked bulkheads |
| 🧯 Extinguisher | Car 3 lockers | Finite foam, refill dock in Car 4 |
| 🔋 Battery cell | Car 4/5 bins | Heavy: carrier speed −30%, tossable |
| ⚡ Coal | Car 4 bin | Boiler fuel |
| 🔩 Spare parts / fuses | Car 4 bin | Repairs & fuse task |
| 🔦 Flashlight | Car 4 locker | Directional light cone while held |

Server owns item state (`items` map: type, holderId, fuel). The client renders
carrying/tossing; toss physics are simulated server-side in fixed ticks.

## 8. Netcode & state contract

### 8.1 What the platform gives us (never rebuild these)

`@sdm/host` (`startGameServer`, `createGameRoom`, routes, logs, room test
helpers), `@sdm/core/shared` (env, messages envelope, replay format,
`SeededRandom`), `@sdm/core/sim` (`GameDefinition`, `BaseState`,
`RoomSettingsSchema`), `@sdm/core/server` (Simulation + replays),
`@sdm/core/client` (prediction, interpolation, debug overlay). Import only via
package names; never `../../server/...`; never patch `server/` — needs go to
`platform`-labeled issues.

### 8.2 State schema (`shared/state.ts`, Colyseus `@colyseus/schema`)

`LastTrainState extends BaseState` — `tick`, `code`, `paused`, `seats` are
owned by the base; do not redeclare them.

```ts
import { Schema, MapSchema, type } from "@colyseus/schema";
import { BaseState } from "@sdm/core/sim";

export class Player extends Schema {
	@type("string") name: string = "";
	@type("uint8") carIndex: number = 0;
	@type("float32") x: number = 0;
	@type("float32") y: number = 0;
	@type("string") anim: string = "idle";
	@type("string") holdingItemId: string = "";
	@type("boolean") eliminated: boolean = false;
}

export class Task extends Schema {
	@type("string") title: string = "";
	@type("uint8") current: number = 0;
	@type("uint8") target: number = 1;
	@type("string") type: string = "POWER";
	@type("string") minigame: string = "wires"; // wires | valves | slider | hold | keypad | taps
	@type("uint8") stepCount: number = 1;
	@type("uint8") stepIndex: number = 0;
}

export class Hazard extends Schema {
	@type("string") type: string = ""; // fire | leak | spill | lockdown | darkness
	@type("uint8") carIndex: number = 0;
	@type("float32") x: number = 0;
	@type("float32") y: number = 0;
	@type("float32") progress: number = 0;
}

export class Item extends Schema {
	@type("string") type: string = ""; // wrench | extinguisher | battery | coal | parts | flashlight
	@type("string") holderId: string = "";
	@type("float32") x: number = 0;
	@type("float32") y: number = 0;
	@type("float32") fuel: number = 0;
}

export class DoorState extends Schema {
	@type("uint8") carIndex: number = 0;
	@type("boolean") locked: boolean = false;
	@type("uint16") lockRemainTicks: number = 0;
}

export class LastTrainState extends BaseState {
	@type("string") phase: string = "lobby";
	@type("float32") journeyDistance: number = 0;
	@type("float32") speed: number = 0;
	@type("uint16") timeLimitTicks: number = 0;
	@type("float32") power: number = 100;
	@type("float32") pressure: number = 0;
	@type("boolean") endgameUnlocked: boolean = false;
	@type({ map: Player }) players = new MapSchema<Player>();
	@type({ map: Task }) tasks = new MapSchema<Task>();
	@type({ map: Hazard }) hazards = new MapSchema<Hazard>();
	@type({ map: Item }) items = new MapSchema<Item>();
	@type({ map: DoorState }) doors = new MapSchema<DoorState>();
}
```

### 8.3 Input contract (clients send inputs, never state — platform rule)

All inputs zod-validated in `shared/input.ts`; movement is server-simulated
(fixed ticks), with client-side prediction via `@sdm/core/client`.

| Input | Payload | Effect (processed in `step`) |
| --- | --- | --- |
| `move` | `{ seq, mx, my, run }` | velocity each tick (hold-to-move: repeated sends) |
| `interactDown` / `interactUp` | `{ stationId }` | press/release pairs drive hold-channels (wrench 5s, crank, brake) and taps |
| `progress` | `{ taskId, amount }` | task director clamps amount 1–4 |
| `pickup` / `drop` | `{ itemId }` | items module, distance check vs player |
| `toss` | `{ itemId, tx, ty }` | target point; sim integrates toss physics |
| `startRun` | — | lobby → running (host only) |
| debug `commands` | per `@sdm/core/sim` | recorded in replays, rejected in production |

### 8.4 Game definition skeleton (`shared/game.ts`, thin composition root)

```ts
import type { GameDefinition } from "@sdm/core/sim";
import { LastTrainState } from "./state";
import { createTasks, TaskDirector } from "./tasks";   // owner B
import { createItems } from "./items";                 // owner C
import { createSim } from "./sim";                     // owner D (power/pressure/stations/hazards)
import { inputSchema } from "./input";

export const lastTrain: GameDefinition<LastTrainState> = {
	createState: () => new LastTrainState(),
	init: (state, deps) => {
		state.modules = { tasks: createTasks(deps), items: createItems(deps), sim: createSim(deps) };
	},
	join: (state, sessionId, opts) => { /* new Player, name from opts */ },
	leave: (state, sessionId) => { /* drop held item, mark seat */ },
	step: (state, input, deps) => {
		// per fixed tick: sim.tick(), tasks.tick(), items.tick(),
		// journey distance += speed(power, pressure) * dt,
		// win/lose checks, door lockdown countdowns
	},
	commands: { /* debug: spawn task, set power, skip phase */ },
};
```

`room/index.ts` registers the factory: `{ game: (deps) => createGameRoom(lastTrain, deps) }`.
`server.ts` calls `startGameServer()`. `config/game.json` holds `tickRate`,
`patchRate`, `maxPlayers: 4`, `reconnectSeconds` + tuning values (spawn
intervals, drain rates) — validated by the config schema in `shared/`.

### 8.5 Client architecture (`client/`)

- `net.ts` — `@colyseus/sdk` join (`/team-2` path via gateway or `:2567` local),
  state callbacks (`onAdd`/`onRemove`/`onChange`), reconnection.
- `render.ts` — **Three.js** scene (`three` as a game-specific dependency in
  the team `package.json`, per platform rules): low-poly 5-carriage interior,
  capsule player avatars, interactable station meshes with proximity
  highlight, per-car lights tied to power (darkness = dim + flashlight cone),
  doors animating from state. Camera follows the local player; remote players
  interpolated from schema snapshots.
- `minigames/` — Among-Us-style DOM panels, one module per type (§4). Opening
  a panel pauses nothing — the world keeps running around you; that tension
  is the point. Completion sends validated `progress` inputs.
- `hud.ts` — DOM overlay: task checklist (keyed rows), the **train-on-a-track
  journey strip with schedule ghost** (#78), Power/Pressure, per-car alarms,
  interact prompt, win/lose screens.
- `input.ts` — keyboard → throttled input sends (~10 Hz move, events for
  interact/pickup/toss).

## 9. Reference snippets

### Task director rules (port target for `shared/tasks.ts`)

```ts
export class TaskDirector {
	static readonly MAX_CONCURRENT = 4;
	static readonly ENDGAME_UNLOCK = 0.9;

	// tick(state, deps): every spawnIntervalTicks()
	//   intervalTicks = lerp(25s, 8s, journeyDistance) * tickRate
	//   if active >= MAX_CONCURRENT -> skip
	//   pool = defs not currently active, endgame defs filtered by unlock
	//   addTask(deps.rng.pick(pool))
	// requestProgress(taskId, amount): clamp(amount, 1, 4); on completion,
	//   erase task, completedCount++ (schema sync is automatic)
}
```

### DOM task checklist (client, keyed rows — no rebuild race)

```ts
export function renderTasks(container: HTMLElement, tasks: Map<string, Task>): void {
	const seen = new Set<string>();
	for (const [id, t] of tasks) {
		seen.add(id);
		let row = container.querySelector<HTMLElement>(`[data-task="${id}"]`);
		if (!row) {
			row = document.createElement("div");
			row.dataset.task = id;
			container.appendChild(row);
		}
		const done = t.current >= t.target;
		row.className = done ? "task done" : "task";
		row.textContent = `${done ? "[x]" : "[ ]"} ${t.title} (${t.current}/${t.target})`;
	}
	container.querySelectorAll<HTMLElement>("[data-task]").forEach((el) => {
		if (!seen.has(el.dataset.task!)) el.remove();
	});
}
```

## 10. Project layout (copy of `server/template/` once built)

```
games/team-2/
  SPEC.md  WORKFLOW.md  README.md
  package.json        @team-2/game
  server.ts           startGameServer() from @sdm/host
  index.html
  vite.config.ts
  client/             net.ts render.ts hud.ts input.ts minigames/
  room/index.ts       { game: (deps) => createGameRoom(lastTrain, deps) }
  shared/             game.ts state.ts input.ts tasks.ts items.ts sim.ts stations.ts hazards.ts
  config/game.json    tickRate patchRate maxPlayers timeLimitSeconds reconnectSeconds + tuning
```

`shared/` stays browser-safe: only `@colyseus/schema`, `zod`, `@sdm/core/shared`,
`@sdm/core/sim` imports. Server tests (vitest) run the rules headless through
`@sdm/core/server`'s Simulation — deterministic, replay-checked.

## 11. Issue breakdown & owners (real GitHub issues)

Open issues already exist — **they were written for the older 3-carriage
"TRACK ZERO" scope; this SPEC (5 carriages) supersedes their wording.**
Reconcile on GitHub: comment the scope update on each kept issue and close
duplicates.

| Real # | Issue | Owner | Action |
|---|---|---|---|
| #35 | Set up the game project structure | A | Keep — closes with the template-copy skeleton PR |
| #37 | Create the top-down train map | A | Keep — comment: scope = 5 carriages per SPEC §2 |
| #43 | Create the train interior layout | A | **Close as duplicate of #37** (same goal) |
| #39 | Implement player movement | C | Keep — server-side movement per SPEC §8.3 |
| #44 | Add the player character | C | Keep — repurpose to character visuals/animation + remote interpolation |
| #40 | Implement object interaction system | C | Keep — expand: stations, prompts, hold-channels |
| #45 | Add multiplayer player movement | C | Keep — 2–4 players, platform interface |

### Issues still to open (next free numbers, ~#48+)

Opened 2026-11-13: **#64** contract (A), **#65** tasks+HUD (B), **#66**
journey/win-lose (A), **#67** items (C), **#68** power/pressure+stations (D),
**#69** hazards (D), **#70** lobby (A), **#71** death/spectator (C), **#72**
juice (D), **#76** minigame library (B), **#77** speed model (D), **#78**
train-on-track HUD (B), **#73** `[platform]` needs (filed by A). Scope
comments on #65/#66. The docs plan PR closes **#74**.

Every issue: `[team-2]` prefix, goal + `done when` checklist, label `team-2`,
assignee = owner. Branch `team-2/<n>-<short-description>`.

## 12. Copy-paste prompt for the coding agent

> Read the root `CLAUDE.md`, `server/CLAUDE.md`, `games/team-2/SPEC.md` and
> `games/team-2/WORKFLOW.md` first. This project is TypeScript in a pnpm
> workspace: Colyseus 0.18 authoritative server + deterministic GameDefinition
> (platform `@sdm/*` packages) + Vite browser client. Do NOT rely on pre-0.18
> Colyseus APIs from memory — check `docs.colyseus.io` (append `.md` for raw
> markdown) or install the Colyseus skill (`npx skills add colyseus/skill`).
> Implement issue #N exactly per SPEC. Only create/modify files listed for your
> role in WORKFLOW §1; request changes to other files via issues. Respect the
> determinism rules (SeededRandom, fixed ticks, zod-validated inputs, tuning in
> `config/game.json`). Every server-logic PR ships a vitest test that runs the
> Simulation headless and asserts state; never decide game rules in the client.
