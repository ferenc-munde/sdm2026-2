import type { LastTrainState } from "./state.ts";
import type { Rng } from "./types.ts";

export interface ItemsModule {
	pickup(sessionId: string, itemId: string): boolean;
	drop(sessionId: string): void;
	toss(sessionId: string, itemId: string, tx: number, ty: number): boolean;
	tick(dt: number): void;
}

export function createItems(state: LastTrainState, rng: Rng, config: unknown): ItemsModule {
	return {
		pickup() {
			return false;
		},
		drop() {},
		toss() {
			return false;
		},
		tick() {},
	};
}
