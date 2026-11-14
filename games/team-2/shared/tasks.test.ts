import { describe, expect, it } from "vitest";
import { SeededRandom } from "@sdm/core/shared";
import { MINIGAMES } from "../client/minigames/registry.ts";
import { TRAIN_CARS } from "../client/train-map.ts";
import { LastTrainState, Player } from "./state.ts";
import { ENDGAME_UNLOCK, TASK_DEFS, concurrentCap, createTasks, pickableDefs, spawnIntervalTicks } from "./tasks.ts";

const config = { tickRate: 20 };

describe("task director", () => {
	it("spawns an identical first wave for the same seed", () => {
		const a = new LastTrainState();
		createTasks(a, new SeededRandom(7), config);
		const b = new LastTrainState();
		createTasks(b, new SeededRandom(7), config);
		expect([...a.tasks].map(([id, task]) => [id, task.title, task.stationId]))
			.toEqual([...b.tasks].map(([id, task]) => [id, task.title, task.stationId]));
	});

	it("a fresh room starts with tasks and no endgame ones", () => {
		const state = new LastTrainState();
		const tasks = createTasks(state, new SeededRandom(7), config);
		expect(state.tasks.size).toBe(2);
		for (const task of state.tasks.values()) {
			expect(task.stationId).not.toBe("");
			expect(task.target).toBeGreaterThan(0);
			expect(tasks.activeTaskIdFor(TASK_DEFS.find((def) => def.stationId === task.stationId)!.key)).toBeTruthy();
		}
	});

	it("spawn pacing tightens from 25 s to 8 s across the journey", () => {
		expect(spawnIntervalTicks(0, 20)).toBe(500);
		expect(spawnIntervalTicks(0.5, 20)).toBe(330);
		expect(spawnIntervalTicks(1, 20)).toBe(160);
	});

	it("caps concurrent tasks at players + 2", () => {
		expect(concurrentCap(1)).toBe(3);
		expect(concurrentCap(4)).toBe(6);
	});

	it("spawns on the interval and stops at the cap", () => {
		const state = new LastTrainState();
		const tasks = createTasks(state, new SeededRandom(7), config);
		state.players.set("p1", new Player());
		for (let i = 0; i < spawnIntervalTicks(state.journeyDistance, config.tickRate) - 1; i++) tasks.tick();
		expect(state.tasks.size).toBe(2);
		tasks.tick();
		expect(state.tasks.size).toBe(3);
		for (let i = 0; i < spawnIntervalTicks(state.journeyDistance, config.tickRate); i++) tasks.tick();
		expect(state.tasks.size).toBe(3);
	});

	it("holds endgame tasks back until the unlock threshold", () => {
		const locked = pickableDefs(new Set(), false);
		const unlocked = pickableDefs(new Set(), true);
		expect(locked.some((def) => def.endgame)).toBe(false);
		expect(unlocked.filter((def) => def.endgame)).toHaveLength(TASK_DEFS.filter((def) => def.endgame).length);
		expect(ENDGAME_UNLOCK).toBe(0.9);
	});

	it("completing a task erases it and counts it", () => {
		const state = new LastTrainState();
		const tasks = createTasks(state, new SeededRandom(7), config);
		const [taskId, task] = [...state.tasks][0]!;
		const target = task.target;
		for (let step = 0; step < target; step++) {
			expect(tasks.requestProgress(taskId, 1)).toBe(true);
		}
		expect(state.tasks.has(taskId)).toBe(false);
		expect(state.completedCount).toBe(1);
		expect(tasks.requestProgress(taskId, 1)).toBe(false);
		expect(tasks.activeTaskIdFor(TASK_DEFS.find((def) => def.key === taskId.split(":")[0])!.key)).toBeUndefined();
	});

	it("ignores unknown task ids and clamps out-of-range amounts", () => {
		const state = new LastTrainState();
		const tasks = createTasks(state, new SeededRandom(7), config);
		expect(tasks.requestProgress("nope", 1)).toBe(false);
		const [taskId] = [...state.tasks][0]!;
		expect(tasks.requestProgress(taskId, 99)).toBe(true);
		expect(state.completedCount).toBe(1);
	});
});

describe("task catalog integrity", () => {
	it("every minigame id has a registered client minigame", () => {
		for (const def of TASK_DEFS) {
			expect(MINIGAMES[def.minigame], `${def.key} needs a "${def.minigame}" minigame`).toBeTypeOf("function");
		}
	});

	it("every station id exists on the train map", () => {
		const stations = new Set(TRAIN_CARS.flatMap((car) => car.stations.map((station) => station.id)));
		for (const def of TASK_DEFS) {
			expect(stations.has(def.stationId), `${def.key} points at unknown station "${def.stationId}"`).toBe(true);
		}
	});
});
