// The networked GameSession: a seat in the platform game room, reached through
// the platform's connection helper. It has the same shape as the offline model in
// stateModel.ts, so the HUD, the scene and the keyboard code do not care which
// one they talk to. Nothing here simulates: the server owns the state.
import { hostRoom, joinRoomByCode, type GameConnection, type ServerAddress } from "@sdm/core/client";
import type { ClientInput } from "../shared/input.ts";
import type { LastTrainState } from "../shared/state.ts";
import type { GameSession } from "./stateModel.ts";

export { JoinError, serverAddress, type ServerAddress } from "@sdm/core/client";

export interface NetSession extends GameSession {
	/** Leaves the game room; resolves when the server has let go of the seat. */
	stop(): Promise<void>;
	/** Calls `fn` when the connection ends for any reason other than `stop()`. */
	onClosed(fn: (code: number) => void): void;
}

const FIRST_STATE_TIMEOUT_MS = 5000;

/** Resolves once the first state arrived: only then are `players` and the room code filled in. */
function toSession(connection: GameConnection<LastTrainState, ClientInput>): Promise<NetSession> {
	const listeners: Array<(state: LastTrainState) => void> = [];
	return new Promise((resolve, reject) => {
		let ready = false;
		const timeout = setTimeout(() => {
			void connection.leave();
			reject(new Error("the game room sent no state"));
		}, FIRST_STATE_TIMEOUT_MS);
		const settle = (): void => {
			if (ready || !connection.code()) return;
			ready = true;
			clearTimeout(timeout);
			resolve({
				get state() {
					return connection.state();
				},
				playerId: connection.sessionId,
				code: connection.code(),
				send: (input) => connection.send(input),
				start: () => {},
				stop: () => connection.leave(),
				onTick: (fn) => {
					listeners.push(fn);
				},
				onClosed: (fn) => connection.onClosed(fn),
			});
		};
		connection.onState((state) => {
			settle();
			for (const fn of listeners) fn(state);
		});
		settle();
	});
}

const options = (name?: string): Record<string, unknown> => (name ? { name } : {});

/** Create a new game room and take the first seat. `session.code` is the code the others join with. */
export async function hostGame(server: ServerAddress, name?: string): Promise<NetSession> {
	return toSession(await hostRoom<LastTrainState, ClientInput>(server, options(name)));
}

/** Join the game room with this code. Throws the platform's `JoinError` (roomNotFound, roomFull, …). */
export async function joinGame(server: ServerAddress, code: string, name?: string): Promise<NetSession> {
	return toSession(await joinRoomByCode<LastTrainState, ClientInput>(server, code, options(name)));
}
