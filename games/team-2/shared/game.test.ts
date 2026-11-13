import { describe, expect, it } from "vitest";
import { parseGameConfig } from "./config.ts";
import { createItems, type ItemsModule } from "./items.ts";
import { createLastTrain } from "./game.ts";
import { SeededRandom } from "./random.ts";
import { Item, Task } from "./state.ts";
import type { InputEvent } from "./types.ts";

const config = parseGameConfig({
	tickRate: 20,
	patchRate: 20,
	maxPlayers: 4,
	reconnectSeconds: 30,
	timeLimitSeconds: 300,
});

const ev = (sessionId: string, input: InputEvent["input"]): InputEvent => ({ sessionId, input });

describe("lastTrain game definition", () => {
	it("initialises the tick budget from the config", () => {
		const game = createLastTrain();
		const state = game.createState();
		game.init(state, new SeededRandom(1), config);
		expect(state.timeLimitTicks).toBe(6000);
	});

	it("join adds a named player, leave drops their item at their last position", () => {
		const game = createLastTrain();
		const state = game.createState();
		game.init(state, new SeededRandom(1), config);
		game.join(state, "s1", { name: "Mahmoud" });
		expect(state.players.get("s1")?.name).toBe("Mahmoud");

		const item = new Item();
		item.type = "wrench";
		item.holderId = "s1";
		item.x = 10;
		item.y = 20;
		state.items.set("i1", item);
		const player = state.players.get("s1")!;
		player.holdingItemId = "i1";
		player.x = 3.5;
		player.y = -2;

		game.leave(state, "s1");
		expect(state.players.has("s1")).toBe(false);
		expect(state.items.get("i1")?.holderId).toBe("");
		expect(state.items.get("i1")?.x).toBeCloseTo(3.5);
		expect(state.items.get("i1")?.y).toBeCloseTo(-2);
	});

	it("step advances the tick and applies progress inputs", () => {
		const game = createLastTrain();
		const state = game.createState();
		game.init(state, new SeededRandom(1), config);
		const task = new Task();
		task.title = "Secure loose cargo crates";
		task.target = 2;
		state.tasks.set("secure_cargo", task);

		game.step(state, [ev("s1", { type: "progress", seq: 0, taskId: "secure_cargo", amount: 4 })], 0.05, new SeededRandom(1), config);
		game.step(state, [ev("s1", { type: "progress", seq: 1, taskId: "secure_cargo", amount: 1 })], 0.05, new SeededRandom(1), config);

		expect(state.tick).toBe(2);
		expect(state.tasks.get("secure_cargo")?.current).toBe(2);
	});

	it("routes pickup and drop inputs to the items module", () => {
		const calls: Array<[string, string, string]> = [];
		const items: ItemsModule = {
			pickup(sessionId, itemId) {
				calls.push(["pickup", sessionId, itemId]);
				return true;
			},
			drop(sessionId, itemId) {
				calls.push(["drop", sessionId, itemId]);
				return true;
			},
			tick() {},
		};
		const game = createLastTrain({ createItems: () => items });
		const state = game.createState();
		game.init(state, new SeededRandom(1), config);
		game.join(state, "s1", {});

		game.step(state, [ev("s1", { type: "pickup", seq: 0, itemId: "wrench" })], 0.05, new SeededRandom(1), config);
		game.step(state, [ev("s2", { type: "drop", seq: 1, itemId: "coal" })], 0.05, new SeededRandom(1), config);

		expect(calls).toEqual([
			["pickup", "s1", "wrench"],
			["drop", "s2", "coal"],
		]);
	});

	it("unknown task ids in progress inputs are ignored", () => {
		const game = createLastTrain();
		const state = game.createState();
		game.init(state, new SeededRandom(1), config);
		expect(() =>
			game.step(state, [ev("s1", { type: "progress", seq: 0, taskId: "nope", amount: 1 })], 0.05, new SeededRandom(1), config),
		).not.toThrow();
	});

	it("createItems stub keeps the default wiring", () => {
		expect(typeof createItems).toBe("function");
	});
});
