import { describe, expect, it } from "vitest";
import { parseGameConfig } from "./config.ts";
import { createItems, type ItemsModule } from "./items.ts";
import { createLastTrain } from "./game.ts";
import { SeededRandom } from "@sdm/core/shared";
import type { GameContext, PlayerInput } from "@sdm/core/sim";
import type { GameConfig } from "./config.ts";
import type { ClientInput } from "./input.ts";
import { CAR_FLOORS, PASSAGE_FLOORS, SPAWN_CAR, WALKABLE, contains } from "./map.ts";
import { Item, Task } from "./state.ts";

const config = parseGameConfig({
	tickRate: 20,
	patchRate: 20,
	maxPlayers: 4,
	reconnectSeconds: 30,
	timeLimitSeconds: 300,
});

const newCtx = (seed = 1): GameContext<GameConfig> => ({ random: new SeededRandom(seed), config });
const ev = (playerId: string, input: ClientInput): PlayerInput<ClientInput> => ({ playerId, input });

describe("lastTrain game definition", () => {
	it("initialises the tick budget from the config", () => {
		const game = createLastTrain();
		const state = game.createState(config);
		const ctx = newCtx();
		game.init(state, ctx);
		expect(state.timeLimitTicks).toBe(6000);
	});

	it("keeps the run clock in the state: it counts running ticks only and restarts with a new run", () => {
		const game = createLastTrain();
		const state = game.createState(config);
		const ctx = newCtx();
		game.init(state, ctx);
		const steps = (count: number) => {
			for (let i = 0; i < count; i++) game.step(state, [], ctx);
		};

		steps(30);
		expect(state.runTicks).toBe(0); // the lobby consumes no time

		state.phase = "running";
		steps(50);
		expect(state.runTicks).toBe(50);

		state.phase = "won";
		steps(40);
		expect(state.runTicks).toBe(50); // a finished run keeps its final time

		state.phase = "running";
		steps(1);
		expect(state.runTicks).toBe(1); // a new run starts the clock again

		state.phase = "lobby";
		steps(1);
		expect(state.runTicks).toBe(0);
	});

	it("join adds a named player, leave drops their item at their last position", () => {
		const game = createLastTrain();
		const state = game.createState(config);
		const ctx = newCtx();
		game.init(state, ctx);
		game.join(state, "s1", ctx, { name: "Mahmoud" });
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

		game.leave(state, "s1", ctx);
		expect(state.players.has("s1")).toBe(false);
		expect(state.items.get("i1")?.holderId).toBe("");
		expect(state.items.get("i1")?.x).toBeCloseTo(3.5);
		expect(state.items.get("i1")?.y).toBeCloseTo(-2);
	});

	it("progress clamps per input, then completes and erases at the target", () => {
		const game = createLastTrain();
		const state = game.createState(config);
		const ctx = newCtx();
		game.init(state, ctx);
		const task = new Task();
		task.title = "Secure loose cargo crates";
		task.target = 4;
		state.tasks.set("secure_cargo", task);

		game.step(state, [ev("s1", { type: "progress", taskId: "secure_cargo", amount: 2 })], ctx);
		expect(state.tasks.get("secure_cargo")?.current).toBe(2);

		game.step(state, [ev("s1", { type: "progress", taskId: "secure_cargo", amount: 99 })], ctx);
		expect(state.tasks.has("secure_cargo")).toBe(false);
		expect(state.completedCount).toBe(1);
		expect(state.tick).toBe(0);
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
		const state = game.createState(config);
		const ctx = newCtx();
		game.init(state, ctx);
		game.join(state, "s1", ctx, {});

		game.step(state, [ev("s1", { type: "pickup", itemId: "wrench" })], ctx);
		game.step(state, [ev("s2", { type: "drop", itemId: "coal" })], ctx);

		expect(calls).toEqual([
			["pickup", "s1", "wrench"],
			["drop", "s2", "coal"],
		]);
	});

	it("unknown task ids in progress inputs are ignored", () => {
		const game = createLastTrain();
		const state = game.createState(config);
		const ctx = newCtx();
		game.init(state, ctx);
		expect(() =>
			game.step(state, [ev("s1", { type: "progress", taskId: "nope", amount: 1 })], ctx),
		).not.toThrow();
	});

	it("createItems stub keeps the default wiring", () => {
		expect(typeof createItems).toBe("function");
	});

	it("describes itself to the platform: id, schemas and optional join name", () => {
		const game = createLastTrain();
		expect(game.id).toBe("team-2");
		expect(game.inputSchema.safeParse({ type: "move", mx: 1, my: 0, run: false }).success).toBe(true);
		expect(game.joinOptionsSchema?.safeParse({ name: "" }).success).toBe(false);
		expect(game.joinOptionsSchema?.safeParse({}).success).toBe(true);
	});
});

describe("movement", () => {
	const setup = () => {
		const game = createLastTrain();
		const state = game.createState(config);
		const ctx = newCtx();
		game.init(state, ctx);
		game.join(state, "s1", ctx, { name: "Ada" });
		return { game, state, ctx, player: state.players.get("s1")! };
	};
	const onBoard = (x: number, y: number) => WALKABLE.some((rect) => contains(rect, x, y));

	it("spawns every player at a different walkable point", () => {
		const { game, state, ctx } = setup();
		for (const id of ["s2", "s3", "s4"]) game.join(state, id, ctx, {});
		const spots = new Set<string>();
		for (const player of state.players.values()) {
			expect(player.carIndex).toBe(SPAWN_CAR);
			expect(contains(CAR_FLOORS[SPAWN_CAR]!, player.x, player.y)).toBe(true);
			spots.add(`${player.x},${player.y}`);
		}
		expect(spots.size).toBe(4);
		expect(state.players.get("s2")?.name).toBe("Crew 2");
	});

	it("a move input walks at the configured speed until the player stops", () => {
		const { game, state, ctx, player } = setup();
		const startX = player.x;
		game.step(state, [ev("s1", { type: "move", mx: 1, my: 0, run: false })], ctx);
		game.step(state, [], ctx);
		expect(player.x).toBeCloseTo(startX + (2 * config.walkSpeed) / config.tickRate);
		expect(player.anim).toBe("walk");

		game.step(state, [ev("s1", { type: "move", mx: 0, my: 0, run: false })], ctx);
		game.step(state, [], ctx);
		expect(player.x).toBeCloseTo(startX + (2 * config.walkSpeed) / config.tickRate);
		expect(player.anim).toBe("idle");
	});

	it("running is faster and diagonals are not", () => {
		const { game, state, ctx, player } = setup();
		const startX = player.x;
		const startY = player.y;
		game.step(state, [ev("s1", { type: "move", mx: -1, my: -1, run: true })], ctx);
		expect(Math.hypot(player.x - startX, player.y - startY)).toBeCloseTo(config.runSpeed / config.tickRate);
		expect(player.anim).toBe("run");
	});

	it("stops at the carriage wall", () => {
		const { game, state, ctx, player } = setup();
		const floor = CAR_FLOORS[SPAWN_CAR]!;
		game.step(state, [ev("s1", { type: "move", mx: 1, my: 0, run: true })], ctx);
		for (let i = 0; i < 100; i++) game.step(state, [], ctx);
		expect(player.x).toBe(floor.x + floor.width);
		expect(player.carIndex).toBe(SPAWN_CAR);
	});

	it("walks along the aisle through the passages to both ends of the train", () => {
		const { game, state, ctx, player } = setup();
		const aisle = PASSAGE_FLOORS[0]!.x + PASSAGE_FLOORS[0]!.width / 2;
		player.x = aisle;
		game.step(state, [ev("s1", { type: "move", mx: 0, my: 1, run: true })], ctx);
		for (let i = 0; i < 200; i++) {
			game.step(state, [], ctx);
			expect(onBoard(player.x, player.y)).toBe(true);
		}
		const last = CAR_FLOORS[CAR_FLOORS.length - 1]!;
		expect(player.carIndex).toBe(CAR_FLOORS.length - 1);
		expect(player.y).toBe(last.y + last.height);

		game.step(state, [ev("s1", { type: "move", mx: 0, my: -1, run: true })], ctx);
		for (let i = 0; i < 200; i++) game.step(state, [], ctx);
		expect(player.carIndex).toBe(0);
		expect(player.y).toBe(CAR_FLOORS[0]!.y);
	});

	it("cannot leave a carriage through the wall beside the passage", () => {
		const { game, state, ctx, player } = setup();
		const floor = CAR_FLOORS[SPAWN_CAR]!;
		player.x = floor.x + 5;
		game.step(state, [ev("s1", { type: "move", mx: 0, my: 1, run: true })], ctx);
		for (let i = 0; i < 100; i++) game.step(state, [], ctx);
		expect(player.y).toBe(floor.y + floor.height);
	});

	it("a dropped player stops moving", () => {
		const { game, state, ctx, player } = setup();
		game.step(state, [ev("s1", { type: "move", mx: 1, my: 0, run: false })], ctx);
		game.disconnect?.(state, "s1", ctx);
		const x = player.x;
		game.step(state, [], ctx);
		expect(player.x).toBe(x);
		expect(player.anim).toBe("idle");
	});

	it("is deterministic: the same inputs give the same positions", () => {
		const run = () => {
			const { game, state, ctx, player } = setup();
			game.step(state, [ev("s1", { type: "move", mx: 0.6, my: -0.3, run: false })], ctx);
			for (let i = 0; i < 30; i++) game.step(state, [], ctx);
			return [player.x, player.y, player.carIndex];
		};
		expect(run()).toEqual(run());
	});
});
