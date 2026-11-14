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
	/** Whether the previous step was part of a run; a change to true starts the run clock again. */
	wasRunning: boolean;
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
				wasRunning: false,
			});
		},

		join: (state, playerId, _ctx, options) => {
			// The lobby has already collected the crew. The first seat in the game
			// room begins the shared run; later crew members join the running state.
			if (state.players.size === 0 && state.phase === "lobby") {
				state.phase = "running";
				state.runTicks = 0;
			}
			const player = new Player();
			player.name = options?.name ?? `Crew ${state.players.size + 1}`;
			placeAtSpawn(player, state.players.size);
			state.players.set(playerId, player);
			// The separate waiting room has already departed before creating/joining this room.
			if (state.phase === "lobby" && state.players.size === 1) state.phase = "running";
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
			// The run clock lives in the synced state, not in any client: see `runTicks` in state.ts.
			const running = state.phase === "running";
			if (running && !modules.wasRunning) state.runTicks = 0;
			if (running) state.runTicks += 1;
			else if (state.phase === "lobby") state.runTicks = 0;
			modules.wasRunning = running;
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
