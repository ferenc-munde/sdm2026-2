import { parseGameConfig } from "./config.ts";
import { createItems, type ItemsModule } from "./items.ts";
import { createSim, type SimModule } from "./sim.ts";
import { createTasks, type TasksModule } from "./tasks.ts";
import { LastTrainState, Player } from "./state.ts";
import type { GameDefinition, InputEvent, Rng } from "./types.ts";

interface Modules {
	tasks: TasksModule;
	items: ItemsModule;
	sim: SimModule;
}

interface ModuleFactories {
	createTasks: typeof createTasks;
	createItems: typeof createItems;
	createSim: typeof createSim;
}

const modulesByState = new WeakMap<LastTrainState, Modules>();

export function createLastTrain(overrides: Partial<ModuleFactories> = {}): GameDefinition<LastTrainState> {
	const factories = { createTasks, createItems, createSim, ...overrides };
	return {
		createState: () => new LastTrainState(),

		init: (state, rng, config) => {
			const cfg = parseGameConfig(config);
			state.timeLimitTicks = cfg.tickRate * cfg.timeLimitSeconds;
			modulesByState.set(state, {
				tasks: factories.createTasks(state, rng, cfg),
				items: factories.createItems(state, rng, cfg),
				sim: factories.createSim(state, rng, cfg),
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
				if (item) {
					item.holderId = "";
					item.x = player.x;
					item.y = player.y;
				}
			}
			state.players.delete(sessionId);
		},

		step: (state, events, dt, rng, config) => {
			state.tick += 1;
			const modules = modulesByState.get(state);
			if (!modules) return;
			modules.tasks.tick();
			modules.items.tick(dt);
			modules.sim.tick(dt);
			for (const event of events as readonly InputEvent[]) {
				const input = event.input;
				if (input.type === "progress") {
					modules.tasks.requestProgress(input.taskId, input.amount);
				} else if (input.type === "pickup") {
					modules.items.pickup(event.sessionId, input.itemId);
				} else if (input.type === "drop") {
					modules.items.drop(event.sessionId, input.itemId);
				}
			}
		},

		commands: {},
	};
}

export const lastTrain = createLastTrain();
