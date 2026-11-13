import type { LastTrainState } from "./state.ts";
import type { Rng } from "./types.ts";

export interface ItemsModule {
	pickup(sessionId: string, itemId: string): boolean;
	drop(sessionId: string, itemId: string): boolean;
	tick(dt: number): void;
}

const PICKUP_RADIUS = 1.5;

export function createItems(state: LastTrainState, _rng: Rng, _config: unknown): ItemsModule {
	return {
		pickup(sessionId, itemId) {
			const player = state.players.get(sessionId);
			const item = state.items.get(itemId);
			if (!player || !item || player.holdingItemId !== "" || item.holderId !== "") {
				return false;
			}

			const distance = Math.hypot(item.x - player.x, item.y - player.y);
			if (!Number.isFinite(distance) || distance > PICKUP_RADIUS) {
				return false;
			}

			player.holdingItemId = itemId;
			item.holderId = sessionId;
			return true;
		},
		drop(sessionId, itemId) {
			const player = state.players.get(sessionId);
			if (!player || player.holdingItemId !== itemId || itemId === "") {
				return false;
			}

			const item = state.items.get(itemId);
			if (!item || item.holderId !== sessionId) {
				return false;
			}

			item.holderId = "";
			item.x = player.x;
			item.y = player.y;
			player.holdingItemId = "";
			return true;
		},
		tick() {},
	};
}
