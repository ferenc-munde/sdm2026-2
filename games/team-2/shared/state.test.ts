import { Decoder, Encoder } from "@colyseus/schema";
import { describe, expect, it } from "vitest";
import { LastTrainState, Player, Task } from "./state.ts";

describe("LastTrainState", () => {
	it("starts in a clean lobby", () => {
		const state = new LastTrainState();
		expect(state.phase).toBe("lobby");
		expect(state.power).toBe(100);
		expect(state.pressure).toBe(0);
		expect(state.journeyDistance).toBe(0);
		expect(state.players.size).toBe(0);
	});

	it("stores players and tasks in maps", () => {
		const state = new LastTrainState();
		const player = new Player();
		player.name = "Zeyad";
		state.players.set("s1", player);
		const task = new Task();
		task.title = "Restore main power grid";
		state.tasks.set("restore_power", task);
		expect(state.players.get("s1")?.name).toBe("Zeyad");
		expect(state.tasks.get("restore_power")?.title).toBe("Restore main power grid");
	});

	it("round-trips through schema encode/decode", () => {
		const state = new LastTrainState();
		state.phase = "running";
		state.speed = 42.5;
		const player = new Player();
		player.name = "Shahd";
		state.players.set("s2", player);
		const bytes = new Encoder(state).encodeAll();
		const decoded = new LastTrainState();
		new Decoder(decoded).decode(bytes);
		expect(decoded.phase).toBe("running");
		expect(decoded.speed).toBeCloseTo(42.5);
		expect(decoded.players.get("s2")?.name).toBe("Shahd");
	});
});
