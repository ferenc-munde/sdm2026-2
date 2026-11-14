import type { LastTrainState } from "./state.ts";
import type { SeededRandom } from "@sdm/core/shared";
import type { GameConfig } from "./config.ts";

export interface SimModule {
	tick(dt: number): void;
}

export function createSim(state: LastTrainState, _rng: SeededRandom, config: GameConfig): SimModule {
	return {
		tick(dt) {
			if (state.phase !== "running" || state.paused || state.journeyDistance >= 1) {
				state.speed = 0;
				return;
			}
			if (!Number.isFinite(dt) || dt <= 0) return;
			let outstanding = 0;
			for (const task of state.tasks.values()) {
				if (task.current < task.target) outstanding++;
			}
			const drag = Math.min(config.maxSpeedDrag,
				outstanding * config.taskSpeedDrag + state.hazards.size * config.hazardSpeedDrag);
			// Read gauges without owning their simulation. A healthy starting train moves immediately.
			const power = Math.min(1, Math.max(0, state.power / 100));
			const pressure = 1 - Math.min(1, Math.max(0, state.pressure / 100));
			state.speed = (1 / config.cruiseTravelSeconds) * power * pressure * (1 - drag);
			state.journeyDistance = Math.min(1, state.journeyDistance + state.speed * dt);
			// Arrival/timeout results belong to the journey/win-lose rules, not this module.
			if (state.journeyDistance >= 1) state.speed = 0;
		},
	};
}
