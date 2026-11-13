import { describe, expect, it } from "vitest";
import { LOCAL_SESSION_ID, createLocalStateModel } from "./stateModel.ts";

describe("local state model (interim room adapter)", () => {
	it("stamps sessionId and monotonic seq, batching queued inputs per step", () => {
		const model = createLocalStateModel(1);
		model.send({ type: "pickup", itemId: "wrench" });
		model.send({ type: "drop", itemId: "wrench" });

		const applied = model.drainAndStep();

		expect(applied).toEqual([
			{ sessionId: LOCAL_SESSION_ID, input: { type: "pickup", seq: 0, itemId: "wrench" } },
			{ sessionId: LOCAL_SESSION_ID, input: { type: "drop", seq: 1, itemId: "wrench" } },
		]);
	});

	it("an empty queue yields no events, the tick still advances", () => {
		const model = createLocalStateModel(1);
		const before = model.state.tick;
		const applied = model.drainAndStep();
		expect(applied).toEqual([]);
		expect(model.state.tick).toBe(before + 1);
	});

	it("seq keeps rising across steps", () => {
		const model = createLocalStateModel(1);
		model.send({ type: "move", mx: 1, my: 0, run: false });
		model.drainAndStep();
		model.send({ type: "move", mx: 0, my: 1, run: true });
		const applied = model.drainAndStep();
		expect(applied[0]?.input.seq).toBe(1);
	});
});
