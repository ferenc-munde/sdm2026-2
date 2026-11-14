import type { SeededRandom } from "@sdm/core/shared";
import { LastTrainState, Task, type TaskType } from "./state.ts";

/**
 * The task director (SPEC §9): tasks spawn on a schedule that tightens as the
 * journey progresses, at most `players + 2` are active at once, and endgame
 * tasks only join the pool once the train is nearly there. Progress arrives as
 * `progress` inputs from minigames (#76); completing a task erases it and
 * counts it. Power/pressure consequences stay in the sim module (D) — this
 * module never touches them.
 */

export interface TaskDef {
	/** Stable key; live task ids are `${key}:${serial}` so repeats can exist. */
	key: string;
	title: string;
	type: TaskType;
	/** Station in client/train-map.ts the minigame opens at. */
	stationId: string;
	/** Id in client/minigames/registry.ts — every catalog id must have a registry entry. */
	minigame: string;
	/** Completed steps needed (each finished minigame sends amount 1). */
	target: number;
	/** Only spawnable once the journey passes ENDGAME_UNLOCK. */
	endgame?: boolean;
}

export const TASK_DEFS: readonly TaskDef[] = [
	{ key: "stoke-boiler", title: "Stoke the boiler", type: "FIRE", stationId: "boiler", minigame: "crank", target: 1 },
	{ key: "balance-valves", title: "Balance the intake valves", type: "PRESSURE", stationId: "intake-valves", minigame: "panel", target: 2 },
	{ key: "reset-breaker", title: "Reset the breaker box", type: "POWER", stationId: "breaker-box", minigame: "panel", target: 1 },
	{ key: "seal-pipes", title: "Seal the pipe junction", type: "PRESSURE", stationId: "pipe-junction", minigame: "wires", target: 1 },
	{ key: "calibrate-nav", title: "Calibrate the navigation console", type: "NAVIGATION", stationId: "nav-left", minigame: "panel", target: 1 },
	{ key: "check-brake", title: "Check the emergency brake", type: "NAVIGATION", stationId: "emergency-brake", minigame: "crank", target: 1 },
	{ key: "secure-cargo", title: "Secure the loose cargo", type: "CARGO", stationId: "battery-bin", minigame: "panel", target: 2 },
	{ key: "crank-generator", title: "Hand-crank the generator", type: "POWER", stationId: "generator-crank", minigame: "crank", target: 3, endgame: true },
	{ key: "throw-switch", title: "Throw the track switch", type: "NAVIGATION", stationId: "track-switcher", minigame: "wires", target: 1, endgame: true },
];

export const ENDGAME_UNLOCK = 0.9;
/** Tasks spawned at init, before any ticking. */
const INITIAL_TASKS = 2;

const lerp = (from: number, to: number, t: number): number => from + (to - from) * Math.min(1, Math.max(0, t));

/** Ticks between spawns: 25 s early, 8 s once the journey is complete (SPEC §9). */
export function spawnIntervalTicks(journeyDistance: number, tickRate: number): number {
	return Math.max(1, Math.round(lerp(25, 8, journeyDistance) * tickRate));
}

/** How many tasks may be active at once, given the crew size (SPEC §9). */
export function concurrentCap(playerCount: number): number {
	return playerCount + 2;
}

/** The defs a spawn may pick from: nothing already active, endgame only when unlocked. */
export function pickableDefs(activeKeys: ReadonlySet<string>, endgameUnlocked: boolean): TaskDef[] {
	return TASK_DEFS.filter((def) => !activeKeys.has(def.key) && (endgameUnlocked || !def.endgame));
}

export interface TasksModule {
	/** The room shell routes `progress` inputs here; returns true when a step counted. */
	requestProgress(taskId: string, amount: number): boolean;
	/** The live task id spawned from this def key, if it is currently active. */
	activeTaskIdFor(key: string): string | undefined;
	tick(): void;
}

export function createTasks(state: LastTrainState, rng: SeededRandom, config: { tickRate: number }): TasksModule {
	const keysByTaskId = new Map<string, string>();
	let cooldown = 0;
	let serial = 0;

	function spawn(def: TaskDef): void {
		serial += 1;
		const id = `${def.key}:${serial}`;
		keysByTaskId.set(id, def.key);
		const task = new Task();
		task.title = def.title;
		task.type = def.type;
		task.minigame = def.minigame;
		task.stationId = def.stationId;
		task.target = def.target;
		task.current = 0;
		task.stepCount = def.target;
		task.stepIndex = 0;
		state.tasks.set(id, task);
	}

	// The first wave exists as soon as the room does, so a fresh room is never empty.
	const initialKeys = new Set<string>();
	for (let i = 0; i < INITIAL_TASKS; i++) {
		const pool = pickableDefs(initialKeys, state.endgameUnlocked || state.journeyDistance >= ENDGAME_UNLOCK);
		if (pool.length === 0) break;
		const def = rng.pick(pool);
		initialKeys.add(def.key);
		spawn(def);
	}
	cooldown = spawnIntervalTicks(state.journeyDistance, config.tickRate);

	return {
		requestProgress(taskId, amount) {
			const task = state.tasks.get(taskId);
			if (!task) return false;
			const before = task.current;
			task.current = Math.min(task.target, task.current + Math.max(1, Math.min(4, amount)));
			if (task.current < task.target) return before !== task.current;
			state.tasks.delete(taskId);
			keysByTaskId.delete(taskId);
			state.completedCount += 1;
			return true;
		},

		activeTaskIdFor(key) {
			for (const [taskId, defKey] of keysByTaskId) {
				if (defKey === key && state.tasks.has(taskId)) return taskId;
			}
			return undefined;
		},

		tick() {
			const cap = concurrentCap(state.players.size);
			if (state.tasks.size >= cap) return;
			cooldown -= 1;
			if (cooldown > 0) return;
			cooldown = spawnIntervalTicks(state.journeyDistance, config.tickRate);
			const unlocked = state.endgameUnlocked || state.journeyDistance >= ENDGAME_UNLOCK;
			const pool = pickableDefs(new Set(keysByTaskId.values()), unlocked);
			if (pool.length === 0) return;
			spawn(rng.pick(pool));
		},
	};
}
