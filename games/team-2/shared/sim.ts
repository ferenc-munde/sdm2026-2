import type { LastTrainState } from "./state.ts";
import type { Rng } from "./types.ts";

export interface SimModule {
	tick(dt: number): void;
}

export function createSim(state: LastTrainState, rng: Rng, config: unknown): SimModule {
	return {
		tick() {},
	};
}
