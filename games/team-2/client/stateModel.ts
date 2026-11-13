// Offline stand-in for the platform room (open the client with `?local`). It plays
// the room's role in the browser: one fixed local player id, queued inputs handed
// to step() once per fixed tick, and the tick counter advanced before every step,
// exactly as the room does. The networked counterpart is net.ts; both give the
// rest of the client the same GameSession. The 50 ms driver is a dev-harness
// convenience; the rules in shared/ stay tick-pure and deterministic.
import { SeededRandom } from "@sdm/core/shared";
import type { GameContext, PlayerInput } from "@sdm/core/sim";
import gameConfig from "../config/game.json";
import { parseGameConfig, type GameConfig } from "../shared/config.ts";
import { lastTrain } from "../shared/game.ts";
import type { ClientInput } from "../shared/input.ts";
import type { LastTrainState } from "../shared/state.ts";

export const LOCAL_SESSION_ID = "local-player";

/** What main.ts, the HUD and the scene need from a game, local or networked. */
export interface GameSession {
	readonly state: LastTrainState;
	/** This player's key in `state.players`. */
	readonly playerId: string;
	/** Room code to share; `""` offline. */
	readonly code: string;
	/** Send one input. The room (or this adapter) adds the player id and the sequence number. */
	send(input: ClientInput): void;
	start(): void;
	stop(): void;
	/** Calls `fn` every time the state changed. */
	onTick(fn: (state: LastTrainState) => void): void;
}

export interface StateModel extends GameSession {
	/** One fixed step: hand the queued inputs to step() and return what was applied. */
	drainAndStep(): PlayerInput<ClientInput>[];
}

export function createLocalStateModel(seed = 1): StateModel {
	const ctx: GameContext<GameConfig> = { random: new SeededRandom(seed), config: parseGameConfig(gameConfig) };
	const state = lastTrain.createState(ctx.config);
	lastTrain.init(state, ctx);
	lastTrain.join(state, LOCAL_SESSION_ID, ctx, { name: "You" });
	state.phase = "running";

	let timer: ReturnType<typeof setInterval> | undefined;
	let queue: ClientInput[] = [];
	const listeners: Array<(s: LastTrainState) => void> = [];

	const drainAndStep = (): PlayerInput<ClientInput>[] => {
		const inputs = queue.map((input) => ({ playerId: LOCAL_SESSION_ID, input }));
		queue = [];
		state.tick += 1;
		lastTrain.step(state, inputs, ctx);
		for (const fn of listeners) fn(state);
		return inputs;
	};

	return {
		state,
		playerId: LOCAL_SESSION_ID,
		code: "",
		send: (input) => {
			queue.push(input);
		},
		drainAndStep,
		start: () => {
			timer ??= setInterval(drainAndStep, 1000 / ctx.config.tickRate);
		},
		stop: () => {
			if (timer) clearInterval(timer);
			timer = undefined;
		},
		onTick: (fn) => {
			listeners.push(fn);
		},
	};
}
