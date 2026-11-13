import type { LastTrainState } from "./state.ts";
import type { Rng } from "./types.ts";

export interface ItemsModule {
	pickup(sessionId: string, itemId: string): boolean;
	drop(sessionId: string, itemId: string): boolean;
	tick(dt: number): void;
}

export function createItems(state: LastTrainState, rng: Rng, config: unknown): ItemsModule {
	return {
		pickup() {
			return false;
		},
		drop() {
			return false;
		},
		tick() {},
	};
}
