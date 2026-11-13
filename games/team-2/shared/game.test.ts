import { describe, expect, it } from "vitest";
import { parseGameConfig } from "./config.ts";
import { lastTrain } from "./game.ts";
import { SeededRandom } from "./random.ts";
import { Item, Task } from "./state.ts";

const config = parseGameConfig({
	tickRate: 20,
	patchRate: 20,
	maxPlayers: 4,
	reconnectSeconds: 30,
	timeLimitSeconds: 300,
});

describe("lastTrain game definition", () => {
	it("initialises the tick budget from the config", () => {
		const state = lastTrain.createState();
		lastTrain.init(state, new SeededRandom(1), config);
		expect(state.timeLimitTicks).toBe(6000);
	});

	it("join adds a named player, leave removes them and clears their item", () => {
		const state = lastTrain.createState();
		lastTrain.init(state, new SeededRandom(1), config);
		lastTrain.join(state, "s1", { name: "Mahmoud" });
		expect(state.players.get("s1")?.name).toBe("Mahmoud");

		const item = new Item();
		item.type = "wrench";
		item.holderId = "s1";
		state.items.set("i1", item);
		state.players.get("s1")!.holdingItemId = "i1";

		lastTrain.leave(state, "s1");
		expect(state.players.has("s1")).toBe(false);
		expect(state.items.get("i1")?.holderId).toBe("");
	});

	it("step advances the tick and applies progress inputs", () => {
		const state = lastTrain.createState();
		lastTrain.init(state, new SeededRandom(1), config);
		const task = new Task();
		task.title = "Secure loose cargo crates";
		task.target = 2;
		state.tasks.set("secure_cargo", task);

		lastTrain.step(state, [{ type: "progress", seq: 0, taskId: "secure_cargo", amount: 4 }], 0.05, new SeededRandom(1), config);
		lastTrain.step(state, [{ type: "progress", seq: 1, taskId: "secure_cargo", amount: 1 }], 0.05, new SeededRandom(1), config);

		expect(state.tick).toBe(2);
		expect(state.tasks.get("secure_cargo")?.current).toBe(2);
	});

	it("unknown task ids in progress inputs are ignored", () => {
		const state = lastTrain.createState();
		lastTrain.init(state, new SeededRandom(1), config);
		expect(() =>
			lastTrain.step(state, [{ type: "progress", seq: 0, taskId: "nope", amount: 1 }], 0.05, new SeededRandom(1), config),
		).not.toThrow();
	});
});
