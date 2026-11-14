import { describe, expect, it } from "vitest";
import { SeededRandom } from "@sdm/core/shared";
import { parseGameConfig } from "./config.ts";
import { createSim } from "./sim.ts";
import { Hazard, LastTrainState, Task } from "./state.ts";

const config = parseGameConfig({ tickRate: 20, patchRate: 20, maxPlayers: 4,
	reconnectSeconds: 30, timeLimitSeconds: 300 });

function setup() {
	const state = new LastTrainState();
	state.phase = "running";
	return { state, sim: createSim(state, new SeededRandom(1), config) };
}

describe("authoritative train speed", () => {
	it("starts moving, slows with backlog and recovers when a task completes", () => {
		const { state, sim } = setup();
		sim.tick(0.05);
		const cruise = state.speed;
		expect(cruise).toBeGreaterThan(0);
		expect(state.journeyDistance).toBeCloseTo(cruise * 0.05);
		const task = new Task();
		state.tasks.set("repair", task);
		sim.tick(0.05);
		expect(state.speed).toBeCloseTo(cruise * 0.8);
		state.tasks.set("repair2", new Task());
		sim.tick(0.05);
		expect(state.speed).toBeCloseTo(cruise * 0.6);
		task.current = task.target;
		sim.tick(0.05);
		expect(state.speed).toBeCloseTo(cruise * 0.8);
		state.tasks.clear();
		sim.tick(0.05);
		expect(state.speed).toBeCloseTo(cruise);
	});

	it("adds hazard drag, caps backlog drag and reads power and pressure", () => {
		const { state, sim } = setup();
		state.hazards.set("fire", new Hazard());
		sim.tick(1);
		expect(state.speed).toBeCloseTo(0.005 * 0.92);
		for (let n = 0; n < 50; n++) state.tasks.set(String(n), new Task());
		sim.tick(1);
		expect(state.speed).toBeCloseTo(0.005 * 0.15);
		state.power = 50;
		state.pressure = 50;
		sim.tick(1);
		expect(state.speed).toBeCloseTo(0.005 * 0.15 * 0.5 * 0.5);
	});

	it("reaches the destination within the budget with repairs, without choosing a result", () => {
		const { state, sim } = setup();
		state.tasks.set("initial", new Task());
		for (let n = 0; n < 4800; n++) {
			if (n === 400) state.tasks.clear();
			sim.tick(0.05);
		}
		expect(state.journeyDistance).toBe(1);
		expect(state.speed).toBe(0);
		expect(state.phase).toBe("running");
	});

	it("cannot finish the four-minute route if even one task is ignored throughout", () => {
		const { state, sim } = setup();
		state.tasks.set("ignored", new Task());
		for (let n = 0; n < 4800; n++) sim.tick(0.05);
		expect(state.journeyDistance).toBeCloseTo(0.96);
		expect(state.journeyDistance).toBeLessThan(1);
	});

	it("does not advance in lobby, when paused or after a result", () => {
		const { state, sim } = setup();
		for (const phase of ["lobby", "won", "lost"]) {
			state.phase = phase;
			sim.tick(1);
			expect(state.journeyDistance).toBe(0);
			expect(state.speed).toBe(0);
		}
		state.phase = "running";
		state.paused = true;
		sim.tick(1);
		expect(state.journeyDistance).toBe(0);
		state.paused = false;
		for (const dt of [NaN, Infinity, 0, -1]) sim.tick(dt);
		expect(state.journeyDistance).toBe(0);
	});
});
