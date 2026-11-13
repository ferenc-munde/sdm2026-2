import { MapSchema, Schema, type } from "@colyseus/schema";
import { z } from "zod";

export const TEAM_SIZES = [2, 3, 4] as const;
export const LOBBY_COUNTDOWN_SECONDS = 30;

export type TeamSize = (typeof TEAM_SIZES)[number];
export type LobbyStatus = "waiting" | "running" | "cancelled";

const teamSizeSchema = z.union([z.literal(2), z.literal(3), z.literal(4)]);
const playerNameSchema = z.string().trim().min(1).max(16);

export const lobbyJoinOptionsSchema = z.object({
	name: playerNameSchema,
	teamSize: teamSizeSchema,
});

export type LobbyJoinOptions = z.infer<typeof lobbyJoinOptionsSchema>;

export class LobbyPlayer extends Schema {
	@type("string") name = "";
	@type("boolean") isHost = false;
	@type("uint8") slot = 0;
	@type("uint8") avatarIndex = 0;
}

export class LobbyState extends Schema {
	// Replicated by Colyseus so every client sees the same crew and departure state.
	@type("uint8") teamSize = 4;
	@type("uint8") playerCount = 0;
	@type("uint8") startedPlayerCount = 0;
	@type("uint16") secondsRemaining = LOBBY_COUNTDOWN_SECONDS;
	@type("string") status: LobbyStatus = "waiting";
	@type("string") hostSessionId = "";
	@type("string") cancellationReason = "";
	@type({ map: LobbyPlayer }) players = new MapSchema<LobbyPlayer>();
}

export function isTeamSize(value: unknown): value is TeamSize {
	return teamSizeSchema.safeParse(value).success;
}

export function createLobbyState(teamSize: TeamSize): LobbyState {
	const state = new LobbyState();
	state.teamSize = teamSize;
	return state;
}

/** Add one authenticated session and start immediately when the room fills. */
export function addLobbyPlayer(state: LobbyState, sessionId: string, rawName: unknown): boolean {
	// Treat join data as untrusted even though the room also validates it in onAuth.
	const parsedName = playerNameSchema.safeParse(rawName);
	if (
		!parsedName.success ||
		state.status !== "waiting" ||
		state.players.has(sessionId) ||
		state.players.size >= state.teamSize
	) {
		return false;
	}

	const slot = state.players.size;
	const player = new LobbyPlayer();
	player.name = parsedName.data;
	player.slot = slot;
	player.avatarIndex = slot % 4;
	state.players.set(sessionId, player);
	state.playerCount = state.players.size;

	if (!state.hostSessionId) {
		assignHost(state, sessionId);
		state.secondsRemaining = LOBBY_COUNTDOWN_SECONDS;
	}

	// A full crew departs immediately; smaller crews can wait or have the host skip.
	if (state.playerCount >= state.teamSize) startLobby(state);
	return true;
}

/** Remove a disconnected session and pass host to the next joined player. */
export function removeLobbyPlayer(state: LobbyState, sessionId: string): boolean {
	if (!state.players.delete(sessionId)) return false;
	state.playerCount = state.players.size;

	if (state.hostSessionId === sessionId) {
		const nextHost = state.players.keys().next().value as string | undefined;
		assignHost(state, nextHost ?? "");
	}
	reindexPlayers(state);

	if (state.playerCount === 0 && state.status === "waiting") {
		state.secondsRemaining = LOBBY_COUNTDOWN_SECONDS;
		state.hostSessionId = "";
	}
	return true;
}

/** Advance the single server-owned countdown by one second. */
export function advanceLobbyCountdown(state: LobbyState): boolean {
	if (state.status !== "waiting" || state.playerCount === 0) return false;
	if (state.playerCount >= state.teamSize) return startLobby(state);

	state.secondsRemaining = Math.max(0, state.secondsRemaining - 1);
	if (state.secondsRemaining === 0) return startLobby(state);
	return false;
}

/** Cancel a waiting lobby when it cannot form a cooperative crew. */
export function cancelLobby(state: LobbyState, reason: string): boolean {
	if (state.status !== "waiting" || state.playerCount === 0) return false;
	state.status = "cancelled";
	state.secondsRemaining = 0;
	state.cancellationReason = reason;
	return true;
}

/** Starting requires at least one player; empty rooms cannot start. */
export function startLobby(state: LobbyState): boolean {
	if (state.status !== "waiting" || state.playerCount === 0) return false;
	state.status = "running";
	state.secondsRemaining = 0;
	// Freeze the crew size at departure; the match can start with a single player.
	state.startedPlayerCount = state.playerCount;
	return true;
}

function assignHost(state: LobbyState, sessionId: string): void {
	state.hostSessionId = sessionId;
	for (const [id, player] of state.players) player.isHost = id === sessionId;
}

function reindexPlayers(state: LobbyState): void {
	let slot = 0;
	for (const player of state.players.values()) {
		player.slot = slot;
		player.avatarIndex = slot % 4;
		slot += 1;
	}
}
