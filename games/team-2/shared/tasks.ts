import type { LastTrainState } from "./state.ts";
import type { SeededRandom } from "@sdm/core/shared";

export interface TasksModule {
	requestProgress(taskId: string, amount: number): void;
	tick(): void;
}

export function createTasks(state: LastTrainState, rng: SeededRandom, config: unknown): TasksModule {
	return {
		requestProgress(taskId, amount) {
			const task = state.tasks.get(taskId);
			if (!task) return;
			task.current = Math.min(task.target, task.current + Math.max(1, Math.min(4, amount)));
		},
		tick() {},
	};
}
