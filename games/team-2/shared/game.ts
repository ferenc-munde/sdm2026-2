import type { GameDefinition } from "@sdm/core/sim";
import { gameConfigSchema, type GameConfig } from "./config.ts";
import { clientInputSchema, joinOptionsSchema, type ClientInput, type JoinOptions } from "./input.ts";
import { createItems, type ItemsModule } from "./items.ts";
import { createMovement, placeAtSpawn, type MovementModule } from "./movement.ts";
import { createSim, type SimModule } from "./sim.ts";
import { createTasks, type TasksModule } from "./tasks.ts";
import { LastTrainState, Player } from "./state.ts";

export type LastTrainGame = GameDefinition<LastTrainState, GameConfig, ClientInput, JoinOptions>;

interface Modules {
	tasks: TasksModule;
	items: ItemsModule;
	sim: SimModule;
	movement: MovementModule;
}

interface ModuleFactories {
	createTasks: typeof createTasks;
	createItems: typeof createItems;
	createSim: typeof createSim;
}

// Per-room rule modules. They hold no synced data, only what they derive from inputs.
const modulesByState = new WeakMap<LastTrainState, Modules>();

export function createLastTrain(overrides: Partial<ModuleFactories> = {}): LastTrainGame {
	const factories = { createTasks, createItems, createSim, ...overrides };
	return {
		id: "team-2",
		configSchema: gameConfigSchema,
		inputSchema: clientInputSchema,
		joinOptionsSchema,

		createState: () => new LastTrainState(),

		init: (state, ctx) => {
			const cfg = ctx.config;
			state.timeLimitTicks = cfg.tickRate * cfg.timeLimitSeconds;
			modulesByState.set(state, {
				tasks: factories.createTasks(state, ctx.random, cfg),
				items: factories.createItems(state, ctx.random, cfg),
				sim: factories.createSim(state, ctx.random, cfg),
				movement: createMovement(state, cfg),
			});
		},

		join: (state, playerId, _ctx, options) => {
			const player = new Player();
			player.name = options?.name ?? `Crew ${state.players.size + 1}`;
			placeAtSpawn(player, state.players.size);
			state.players.set(playerId, player);
		},

		leave: (state, playerId) => {
			const player = state.players.get(playerId);
			if (player && player.holdingItemId) {
				const item = state.items.get(player.holdingItemId);
				if (item) {
					item.holderId = "";
					item.x = player.x;
					item.y = player.y;
				}
			}
			modulesByState.get(state)?.movement.clear(playerId);
			state.players.delete(playerId);
		},

		// A dropped connection must not leave the player walking into a wall.
		disconnect: (state, playerId) => {
			modulesByState.get(state)?.movement.clear(playerId);
		},

		// The room advances `state.tick` before every step; the rules never write it.
		step: (state, inputs, ctx) => {
			const modules = modulesByState.get(state);
			if (!modules) return;
			const dt = 1 / ctx.config.tickRate;
			modules.tasks.tick();
			modules.items.tick(dt);
			modules.sim.tick(dt);
			for (const { playerId, input } of inputs) {
				if (input.type === "move") {
					modules.movement.setIntent(playerId, { mx: input.mx, my: input.my, run: input.run });
				} else if (input.type === "progress") {
					modules.tasks.requestProgress(input.taskId, input.amount);
				} else if (input.type === "pickup") {
					modules.items.pickup(playerId, input.itemId);
				} else if (input.type === "drop") {
					modules.items.drop(playerId, input.itemId);
				}
			}
			modules.movement.tick();
		},

		commands: {},
	};
}

export const lastTrain = createLastTrain();
