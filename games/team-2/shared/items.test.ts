import { describe, expect, it } from "vitest";
import { createItems } from "./items.ts";
import { SeededRandom } from "@sdm/core/shared";
import { Item, LastTrainState, Player } from "./state.ts";

function createFixture() {
	const state = new LastTrainState();
	const items = createItems(state, new SeededRandom(1), {});
	return { state, items };
}

function addPlayer(state: LastTrainState, sessionId: string, x = 0, y = 0): Player {
	const player = new Player();
	player.x = x;
	player.y = y;
	state.players.set(sessionId, player);
	return player;
}

function addItem(state: LastTrainState, itemId: string, x = 0, y = 0): Item {
	const item = new Item();
	item.x = x;
	item.y = y;
	state.items.set(itemId, item);
	return item;
}

describe("items", () => {
	it("picks up a ground item within the 1.5-unit radius", () => {
		const { state, items } = createFixture();
		const player = addPlayer(state, "player-1");
		const item = addItem(state, "wrench", 1.5);

		expect(items.pickup("player-1", "wrench")).toBe(true);
		expect(player.holdingItemId).toBe("wrench");
		expect(item.holderId).toBe("player-1");
	});

	it("drops the held item at the player's current position", () => {
		const { state, items } = createFixture();
		const player = addPlayer(state, "player-1", 1, 1);
		const item = addItem(state, "wrench");
		expect(items.pickup("player-1", "wrench")).toBe(true);

		player.x = 4.25;
		player.y = -2.5;

		expect(items.drop("player-1", "wrench")).toBe(true);
		expect(player.holdingItemId).toBe("");
		expect(item.holderId).toBe("");
		expect(item.x).toBe(4.25);
		expect(item.y).toBe(-2.5);
	});

	it("rejects pickup when the player does not exist without changing the item", () => {
		const { state, items } = createFixture();
		const item = addItem(state, "wrench", 0.5, 0.25);

		expect(items.pickup("missing-player", "wrench")).toBe(false);
		expect(state.players.size).toBe(0);
		expect(item.holderId).toBe("");
		expect(item.x).toBe(0.5);
		expect(item.y).toBe(0.25);
	});

	it("rejects pickup when the item does not exist without changing the player", () => {
		const { state, items } = createFixture();
		const player = addPlayer(state, "player-1", 0.5, 0.25);

		expect(items.pickup("player-1", "missing-item")).toBe(false);
		expect(player.holdingItemId).toBe("");
		expect(state.items.size).toBe(0);
	});

	it("rejects pickup of an item held by another player without changing either", () => {
		const { state, items } = createFixture();
		const player = addPlayer(state, "player-1");
		const holder = addPlayer(state, "player-2");
		const item = addItem(state, "wrench");
		item.holderId = "player-2";
		holder.holdingItemId = "wrench";

		expect(items.pickup("player-1", "wrench")).toBe(false);
		expect(player.holdingItemId).toBe("");
		expect(holder.holdingItemId).toBe("wrench");
		expect(item.holderId).toBe("player-2");
	});

	it("rejects pickup when the player already holds an item without changing either item", () => {
		const { state, items } = createFixture();
		const player = addPlayer(state, "player-1");
		const heldItem = addItem(state, "held-item");
		const groundItem = addItem(state, "ground-item", 0.5, 0.25);
		player.holdingItemId = "held-item";
		heldItem.holderId = "player-1";

		expect(items.pickup("player-1", "ground-item")).toBe(false);
		expect(player.holdingItemId).toBe("held-item");
		expect(heldItem.holderId).toBe("player-1");
		expect(groundItem.holderId).toBe("");
		expect(groundItem.x).toBe(0.5);
		expect(groundItem.y).toBe(0.25);
	});

	it("rejects pickup outside the radius without changing state", () => {
		const { state, items } = createFixture();
		const player = addPlayer(state, "player-1");
		const item = addItem(state, "wrench", 1.5001);

		expect(items.pickup("player-1", "wrench")).toBe(false);
		expect(player.holdingItemId).toBe("");
		expect(item.holderId).toBe("");
		expect(item.x).toBeCloseTo(1.5001);
		expect(item.y).toBe(0);
	});

	it("rejects drop when the requested item does not match the held item", () => {
		const { state, items } = createFixture();
		const player = addPlayer(state, "player-1", 2, 3);
		const item = addItem(state, "wrench", 0.5, 0.25);
		player.holdingItemId = "wrench";
		item.holderId = "player-1";

		expect(items.drop("player-1", "other-item")).toBe(false);
		expect(player.holdingItemId).toBe("wrench");
		expect(item.holderId).toBe("player-1");
		expect(item.x).toBe(0.5);
		expect(item.y).toBe(0.25);
	});

	it("rejects drop when the player does not exist without changing the item", () => {
		const { state, items } = createFixture();
		const item = addItem(state, "wrench", 0.5, 0.25);
		item.holderId = "missing-player";

		expect(items.drop("missing-player", "wrench")).toBe(false);
		expect(item.holderId).toBe("missing-player");
		expect(item.x).toBe(0.5);
		expect(item.y).toBe(0.25);
	});

	it("rejects drop when the held item does not exist without changing the player", () => {
		const { state, items } = createFixture();
		const player = addPlayer(state, "player-1", 2, 3);
		player.holdingItemId = "missing-item";

		expect(items.drop("player-1", "missing-item")).toBe(false);
		expect(player.holdingItemId).toBe("missing-item");
		expect(state.items.size).toBe(0);
	});

	it("rejects drop when the item is not held by the requesting player", () => {
		const { state, items } = createFixture();
		const player = addPlayer(state, "player-1", 2, 3);
		const item = addItem(state, "wrench", 0.5, 0.25);
		player.holdingItemId = "wrench";
		item.holderId = "player-2";

		expect(items.drop("player-1", "wrench")).toBe(false);
		expect(player.holdingItemId).toBe("wrench");
		expect(item.holderId).toBe("player-2");
		expect(item.x).toBe(0.5);
		expect(item.y).toBe(0.25);
	});
});
