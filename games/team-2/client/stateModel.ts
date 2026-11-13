// Interim room adapter until @sdm/host exists (#73). Plays the room's role
// locally: stamps sessionId from "the envelope" (a fixed local id, never
// client-supplied), batches queued inputs per fixed tick, and drives the real
// GameDefinition. When the platform lands, net.ts + schema callbacks replace
// this file — nothing else changes. The 50ms driver is a dev-harness
// convenience; the rules in shared/ stay tick-pure and deterministic.
import gameConfig from "../config/game.json";
import { lastTrain } from "../shared/game.ts";
import { SeededRandom } from "../shared/random.ts";
import { LastTrainState } from "../shared/state.ts";
import type { ClientInput, InputEvent } from "../shared/types.ts";

export const LOCAL_SESSION_ID = "local-player";

type WithoutSeq<T> = T extends { seq: number } ? Omit<T, "seq"> : never;

export interface StateModel {
	readonly state: LastTrainState;
	/** Queue one input; the adapter stamps seq and sessionId (the room shell's job). */
	send(input: WithoutSeq<ClientInput>): void;
	/** One fixed step: drain queued inputs into step() as InputEvents, then tick. */
	drainAndStep(dt?: number): InputEvent[];
	start(): void;
	stop(): void;
	onTick(fn: (state: LastTrainState) => void): void;
}

export function createLocalStateModel(seed = 1): StateModel {
	const state = lastTrain.createState();
	lastTrain.init(state, new SeededRandom(seed), gameConfig);
	lastTrain.join(state, LOCAL_SESSION_ID, { name: "You" });
	state.phase = "running";

	let timer: ReturnType<typeof setInterval> | undefined;
	let seq = 0;
	let queue: ClientInput[] = [];
	const listeners: Array<(s: LastTrainState) => void> = [];

	const notify = (): void => {
		for (const fn of listeners) fn(state);
	};

	const send = (input: WithoutSeq<ClientInput>): void => {
		queue.push({ ...input, seq: seq++ } as ClientInput);
	};

	const drainAndStep = (dt = 0.05): InputEvent[] => {
		const events: InputEvent[] = queue.map((input) => ({
			sessionId: LOCAL_SESSION_ID,
			input,
		}));
		queue = [];
		lastTrain.step(state, events, dt, new SeededRandom(seed + state.tick), gameConfig);
		notify();
		return events;
	};

	const start = (): void => {
		timer = setInterval(() => drainAndStep(0.05), 50);
	};

	const stop = (): void => {
		if (timer) clearInterval(timer);
	};

	return { state, send, drainAndStep, start, stop, onTick: (fn) => listeners.push(fn) };
}
