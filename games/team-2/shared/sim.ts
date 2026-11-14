import type { LastTrainState } from "./state.ts";
import type { SeededRandom } from "@sdm/core/shared";

export interface SimModule {
	tick(dt: number): void;
}

export function createSim(state: LastTrainState, rng: SeededRandom, config: unknown): SimModule {
	return {
		tick() {},
	};
}
