import { describe, expect, it } from "vitest";
import { LOCAL_SESSION_ID, createLocalStateModel } from "./stateModel.ts";

describe("local state model (offline stand-in for the room)", () => {
	it("stamps the player id and hands the queued inputs to one step, in order", () => {
		const model = createLocalStateModel(1);
		model.send({ type: "pickup", itemId: "wrench" });
		model.send({ type: "drop", itemId: "wrench" });

		const applied = model.drainAndStep();

		expect(applied).toEqual([
			{ playerId: LOCAL_SESSION_ID, input: { type: "pickup", itemId: "wrench" } },
			{ playerId: LOCAL_SESSION_ID, input: { type: "drop", itemId: "wrench" } },
		]);
	});

	it("an empty queue yields no inputs, the tick still advances as the room would advance it", () => {
		const model = createLocalStateModel(1);
		const before = model.state.tick;
		const applied = model.drainAndStep();
		expect(applied).toEqual([]);
		expect(model.state.tick).toBe(before + 1);
	});

	it("each input is applied once: the queue is empty after a step", () => {
		const model = createLocalStateModel(1);
		model.send({ type: "move", mx: 1, my: 0, run: false });
		model.drainAndStep();
		expect(model.drainAndStep()).toEqual([]);
	});

	it("a move input moves the local player and keeps moving until it is released", () => {
		const model = createLocalStateModel(1);
		const player = model.state.players.get(model.playerId)!;
		const startX = player.x;
		model.send({ type: "move", mx: 1, my: 0, run: false });
		model.drainAndStep();
		model.drainAndStep();
		const moved = player.x;
		expect(moved).toBeGreaterThan(startX);
		model.send({ type: "move", mx: 0, my: 0, run: false });
		model.drainAndStep();
		expect(player.x).toBe(moved);
	});
});
