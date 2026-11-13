// Local stand-in for the room/net layer until @sdm/host exists (#73).
// Drives the real GameDefinition headless, browser-side. When the platform
// lands this file is replaced by net.ts + schema callbacks — nothing else
// changes. The 50ms driver is a dev-harness convenience; the rules in shared/
// stay tick-pure and deterministic.
import gameConfig from "../config/game.json";
import { lastTrain } from "../shared/game.ts";
import { SeededRandom } from "../shared/random.ts";
import { LastTrainState } from "../shared/state.ts";

export interface StateModel {
	readonly state: LastTrainState;
	start(): void;
	stop(): void;
	onTick(fn: (state: LastTrainState) => void): void;
}

export function createLocalStateModel(seed = 1): StateModel {
	const state = lastTrain.createState();
	lastTrain.init(state, new SeededRandom(seed), gameConfig);
	lastTrain.join(state, "local-player", { name: "You" });
	state.phase = "running";

	let timer: ReturnType<typeof setInterval> | undefined;
	const listeners: Array<(s: LastTrainState) => void> = [];

	return {
		state,
		start() {
			timer = setInterval(() => {
				lastTrain.step(state, [], 0.05, new SeededRandom(seed + state.tick), gameConfig);
				for (const fn of listeners) fn(state);
			}, 50);
		},
		stop() {
			if (timer) clearInterval(timer);
		},
		onTick(fn) {
			listeners.push(fn);
		},
	};
}
