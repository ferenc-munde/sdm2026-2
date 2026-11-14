import { Room, type Client } from "colyseus";
import {
	addLobbyPlayer,
	createLobbyState,
	GAME_ROOM_MESSAGE,
	gameRoomMessageSchema,
	isTeamSize,
	lobbyCreateOptionsSchema,
	lobbyJoinOptionsSchema,
	removeLobbyPlayer,
	startLobby,
	type LobbyJoinOptions,
	type LobbyState,
} from "../shared/lobby.ts";

export class TrainLobbyRoom extends Room<{ state: LobbyState }> {
	maxClients = 4;
	private matchAnnounced = false;

	onCreate(options: unknown): void {
		const parsed = lobbyCreateOptionsSchema.safeParse(options);
		if (!parsed.success || !isTeamSize(parsed.data.teamSize)) {
			throw new Error("Choose a team size of 2, 3, or 4 players.");
		}
		this.maxClients = parsed.data.teamSize;
		this.autoDispose = true;
		this.setState(createLobbyState(parsed.data.teamSize, this.roomId));
		this.onMessage("start-now", (client) => this.requestStartNow(client));
		this.onMessage(GAME_ROOM_MESSAGE, (client, message) => this.shareGameRoom(client, message));
	}

	onAuth(_client: Client, options: unknown): LobbyJoinOptions | false {
		const parsed = lobbyJoinOptionsSchema.safeParse(options);
		if (!parsed.success) return false;
		if (this.state.status !== "waiting" || this.state.playerCount >= this.state.teamSize) return false;
		return parsed.data;
	}

	onJoin(client: Client): void {
		const auth = client.auth as LobbyJoinOptions | undefined;
		if (!auth || !addLobbyPlayer(this.state, client.sessionId, auth.name)) {
			client.leave(4000, "The lobby is no longer available.");
			return;
		}

		if (this.state.status === "running") this.finishMatch();
	}

	onLeave(client: Client): void {
		removeLobbyPlayer(this.state, client.sessionId);
	}

	private requestStartNow(client: Client): void {
		// Only the current host may skip; startLobby still rejects empty rooms.
		if (client.sessionId !== this.state.hostSessionId) {
			client.send("lobby-error", "The crew host controls departure.");
			return;
		}
		if (startLobby(this.state)) this.finishMatch();
	}

	private shareGameRoom(client: Client, message: unknown): void {
		// After departure the host creates the game room and reports its code; the crew joins by it.
		const parsed = gameRoomMessageSchema.safeParse(message);
		if (!parsed.success || this.state.status !== "running" || client.sessionId !== this.state.hostSessionId) return;
		this.state.gameRoomCode = parsed.data.code;
		this.broadcast(GAME_ROOM_MESSAGE, parsed.data);
	}

	private finishMatch(): void {
		if (this.matchAnnounced || this.state.status !== "running" || this.state.playerCount === 0) return;
		// Guard against the full-crew join and a host start-now racing each other.
		this.matchAnnounced = true;
		this.lock();
		this.broadcast("match-started", {
			teamSize: this.state.teamSize,
			playerCount: this.state.playerCount,
			players: Array.from(this.state.players, ([sessionId, player]) => ({
				sessionId,
				name: player.name,
			})),
		});
	}
}
