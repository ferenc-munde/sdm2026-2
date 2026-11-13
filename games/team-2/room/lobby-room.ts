import { Room, type Client } from "colyseus";
import {
	addLobbyPlayer,
	cancelLobby,
	createLobbyState,
	isTeamSize,
	LOBBY_COUNTDOWN_SECONDS,
	lobbyJoinOptionsSchema,
	removeLobbyPlayer,
	startLobby,
	type LobbyJoinOptions,
	type LobbyState,
} from "../shared/lobby.ts";

type CreateOptions = { teamSize?: unknown };

export class TrainLobbyRoom extends Room<{ state: LobbyState }> {
	maxClients = 4;
	private countdownTask?: { clear: () => void };
	private countdownStartedAt = 0;
	private matchAnnounced = false;
	private cancellationAnnounced = false;

	onCreate(options: CreateOptions): void {
		if (!isTeamSize(options.teamSize)) {
			throw new Error("Choose a team size of 2, 3, or 4 players.");
		}
		this.maxClients = options.teamSize;
		this.autoDispose = true;
		this.setState(createLobbyState(options.teamSize));
		this.onMessage("start-now", (client) => this.requestStartNow(client));
	}

	onAuth(_client: Client, options: unknown): LobbyJoinOptions | false {
		const parsed = lobbyJoinOptionsSchema.safeParse(options);
		if (!parsed.success || parsed.data.teamSize !== this.state.teamSize) return false;
		if (this.state.status !== "waiting" || this.state.playerCount >= this.state.teamSize) return false;
		return parsed.data;
	}

	onJoin(client: Client): void {
		const auth = client.auth as LobbyJoinOptions | undefined;
		if (!auth || !addLobbyPlayer(this.state, client.sessionId, auth.name)) {
			client.leave(4000, "The lobby is no longer available.");
			return;
		}

		if (this.state.playerCount === 1) this.startCountdown();
		if (this.state.status === "running") this.finishMatch();
	}

	onLeave(client: Client): void {
		const previousCount = this.state.playerCount;
		removeLobbyPlayer(this.state, client.sessionId);
		if (this.state.status === "waiting" && previousCount > 1 && this.state.playerCount === 1) {
			this.cancelForSoloPlayer();
			return;
		}
		if (this.state.playerCount === 0 && this.state.status === "waiting") {
			this.stopCountdown();
		}
	}

	onDispose(): void {
		this.stopCountdown();
	}

	private startCountdown(): void {
		this.stopCountdown();
		this.countdownStartedAt = this.clock.currentTime;
		this.countdownTask = this.clock.setInterval(() => {
			const elapsed = Math.floor((this.clock.currentTime - this.countdownStartedAt) / 1000);
			const secondsRemaining = Math.max(0, LOBBY_COUNTDOWN_SECONDS - elapsed);
			if (secondsRemaining !== this.state.secondsRemaining) {
				this.state.secondsRemaining = secondsRemaining;
			}
			if (this.state.secondsRemaining === 0) {
				if (startLobby(this.state)) this.finishMatch();
				else if (this.state.playerCount === 1) this.cancelForSoloPlayer();
			}
		}, 100);
	}

	private requestStartNow(client: Client): void {
		if (client.sessionId !== this.state.hostSessionId) {
			client.send("lobby-error", "The crew host controls departure.");
			return;
		}
		if (this.state.playerCount < 2) {
			client.send("lobby-error", "At least two crew members are needed to start. Keep waiting for players.");
			return;
		}
		if (startLobby(this.state)) this.finishMatch();
	}

	private cancelForSoloPlayer(): void {
		if (!cancelLobby(this.state, "Not enough crew members joined. At least two players are required.")) return;
		this.stopCountdown();
		this.lock();
		if (this.cancellationAnnounced) return;
		this.cancellationAnnounced = true;
		this.broadcast("lobby-cancelled", { reason: this.state.cancellationReason });
	}

	private stopCountdown(): void {
		this.countdownTask?.clear();
		this.countdownTask = undefined;
	}

	private finishMatch(): void {
		if (this.matchAnnounced || this.state.status !== "running" || this.state.playerCount === 0) return;
		this.matchAnnounced = true;
		this.stopCountdown();
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
