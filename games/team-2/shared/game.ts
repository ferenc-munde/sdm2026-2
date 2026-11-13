import { parseGameConfig } from "./config.ts";
import { createItems, type ItemsModule } from "./items.ts";
import { createSim, type SimModule } from "./sim.ts";
import { createTasks, type TasksModule } from "./tasks.ts";
import { LastTrainState, Player } from "./state.ts";
import type { GameDefinition, Rng } from "./types.ts";

interface Modules {
	tasks: TasksModule;
	items: ItemsModule;
	sim: SimModule;
}

const modulesByState = new WeakMap<LastTrainState, Modules>();

export const lastTrain: GameDefinition<LastTrainState> = {
	createState: () => new LastTrainState(),

	init: (state, rng, config) => {
		const cfg = parseGameConfig(config);
		state.timeLimitTicks = cfg.tickRate * cfg.timeLimitSeconds;
		modulesByState.set(state, {
			tasks: createTasks(state, rng, cfg),
			items: createItems(state, rng, cfg),
			sim: createSim(state, rng, cfg),
		});
	},

	join: (state, sessionId, opts) => {
		const player = new Player();
		player.name = opts.name ?? `Crew ${state.players.size + 1}`;
		state.players.set(sessionId, player);
	},

	leave: (state, sessionId) => {
		const player = state.players.get(sessionId);
		if (player && player.holdingItemId) {
			const item = state.items.get(player.holdingItemId);
			if (item) item.holderId = "";
		}
		state.players.delete(sessionId);
	},

	step: (state, inputs, dt, rng, config) => {
		state.tick += 1;
		const modules = modulesByState.get(state);
		if (!modules) return;
		modules.tasks.tick();
		modules.items.tick(dt);
		modules.sim.tick(dt);
		for (const input of inputs) {
			if (input.type === "progress") {
				modules.tasks.requestProgress(input.taskId, input.amount);
			}
		}
	},

	commands: {},
};
