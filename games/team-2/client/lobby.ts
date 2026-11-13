
import { Client as ColyseusClient, type Room } from "@colyseus/sdk";
import "./lobby.css";

interface LobbyPlayerView {
	name: string;
	isHost: boolean;
	slot: number;
	avatarIndex: number;
}

interface LobbyRoomView {
	teamSize: number;
	playerCount: number;
	startedPlayerCount: number;
	secondsRemaining: number;
	status: string;
	hostSessionId: string;
	cancellationReason: string;
	players: Map<string, LobbyPlayerView>;
}

export interface StartedMatch {
	teamSize: number;
	playerCount: number;
	players: Array<{ sessionId: string; name: string }>;
}

const avatarColors = ["mint", "coral", "gold", "blue"];

export function mountLobby(
	parent: HTMLElement,
	onMatchStart: (match: StartedMatch) => void,
): { destroy: () => void } {
	const root = document.createElement("div");
	root.id = "last-train-lobby-root";
	root.className = "last-train-lobby";
	root.innerHTML = `
		<div class="lobby-backdrop">
			<section class="lobby-card" aria-labelledby="lobby-title">
				<header class="lobby-header">
					<div class="lobby-mark" aria-hidden="true">LT</div>
					<div>
						<p class="lobby-kicker">CO-OPERATIVE SURVIVAL</p>
						<h1 id="lobby-title">LAST TRAIN</h1>
					</div>
				</header>
				<section class="lobby-setup" aria-label="Player setup">
					<p class="lobby-lead">Gather your crew before the final departure.</p>
					<form class="lobby-form">
						<label class="lobby-label" for="lobby-player-name">Your player name</label>
						<input id="lobby-player-name" name="playerName" maxlength="16" autocomplete="nickname"
							placeholder="Enter a name" required>
						<label class="lobby-label" for="lobby-team-size">Crew size</label>
						<select id="lobby-team-size" name="teamSize">
							<option value="2">2 players</option>
							<option value="3">3 players</option>
							<option value="4" selected>4 players</option>
						</select>
						<p class="lobby-error" role="alert" aria-live="polite"></p>
						<button class="lobby-primary" type="submit">Create / Join Game</button>
					</form>
					<p class="lobby-footnote">One name is all your crew needs.</p>
				</section>
				<section class="lobby-waiting" aria-label="Waiting room" hidden>
					<div class="lobby-room-heading">
						<div>
							<p class="lobby-kicker">CREW ASSEMBLY</p>
							<h2>Waiting for departure</h2>
						</div>
						<span class="lobby-count" data-player-count>0 / 4 PLAYERS</span>
					</div>
					<div class="lobby-countdown" aria-live="polite">
						<span class="countdown-icon" aria-hidden="true">◷</span>
						<div><small>TRAIN DEPARTS IN</small><strong data-countdown>00:30</strong></div>
					</div>
					<div class="lobby-slots" data-player-slots></div>
					<p class="lobby-wait-message" data-wait-message aria-live="polite">
						Waiting for other players to join your crew…
					</p>
					<p class="lobby-error" data-room-error role="alert" aria-live="polite" hidden></p>
					<div class="lobby-actions">
						<button class="lobby-depart" type="button" data-start-now>DEPART NOW · CURRENT CREW</button>
						<p data-host-hint>Only the crew host can choose departure.</p>
					</div>
					<button class="lobby-secondary" type="button" data-leave>Leave lobby</button>
				</section>
				<section class="lobby-cancelled" aria-live="polite" hidden>
					<div class="lobby-cancel-icon" aria-hidden="true">!</div>
					<p class="lobby-kicker">DEPARTURE CANCELLED</p>
					<h2>More crew required</h2>
					<p class="lobby-cancel-copy" data-cancel-reason></p>
					<button class="lobby-primary" type="button" data-return>Return to station</button>
				</section>
			</section>
			<p class="lobby-track-label" aria-hidden="true">NORTHBOUND · LINE 07</p>
		</div>
	`;
	parent.append(root);

	const setup = root.querySelector<HTMLElement>(".lobby-setup")!;
	const waiting = root.querySelector<HTMLElement>(".lobby-waiting")!;
	const form = root.querySelector<HTMLFormElement>(".lobby-form")!;
	const nameInput = root.querySelector<HTMLInputElement>("#lobby-player-name")!;
	const sizeInput = root.querySelector<HTMLSelectElement>("#lobby-team-size")!;
	const error = root.querySelector<HTMLElement>(".lobby-error")!;
	const submit = root.querySelector<HTMLButtonElement>(".lobby-primary")!;
	const count = root.querySelector<HTMLElement>("[data-player-count]")!;
	const countdown = root.querySelector<HTMLElement>("[data-countdown]")!;
	const slots = root.querySelector<HTMLElement>("[data-player-slots]")!;
	const waitMessage = root.querySelector<HTMLElement>("[data-wait-message]")!;
	const roomError = root.querySelector<HTMLElement>("[data-room-error]")!;
	const leaveButton = root.querySelector<HTMLButtonElement>("[data-leave]")!;
	const startNowButton = root.querySelector<HTMLButtonElement>("[data-start-now]")!;
	const hostHint = root.querySelector<HTMLElement>("[data-host-hint]")!;
	const cancelledPanel = root.querySelector<HTMLElement>(".lobby-cancelled")!;
	const cancelReason = root.querySelector<HTMLElement>("[data-cancel-reason]")!;

	let room: Room<any, LobbyRoomView> | undefined;
	let connecting = false;
	let matchStarted = false;

	form.addEventListener("submit", (event) => {
		event.preventDefault();
		void connect();
	});
	leaveButton.addEventListener("click", () => void leaveLobby());
	startNowButton.addEventListener("click", () => room?.send("start-now"));
	root.querySelector<HTMLButtonElement>("[data-return]")!.addEventListener("click", () => void leaveLobby());

	async function connect(): Promise<void> {
		const name = nameInput.value.trim();
		const teamSize = Number(sizeInput.value);
		if (!name || name.length > 16 || ![2, 3, 4].includes(teamSize)) {
			error.textContent = "Enter a name and choose a crew size.";
			return;
		}
		if (connecting) return;

		connecting = true;
		submit.disabled = true;
		error.textContent = "Connecting to the crew network…";
		try {
			const client = new ColyseusClient(lobbyServerUrl());
			room = await client.joinOrCreate<LobbyRoomView>("train_lobby", { name, teamSize });
			error.textContent = "";
			setup.hidden = true;
			waiting.hidden = false;
			room.onStateChange(sync);
			room.onMessage("match-started", (match: StartedMatch) => startMatch(match));
			room.onMessage("lobby-cancelled", ({ reason }: { reason?: string }) => {
				cancelReason.textContent = reason || "At least two players are needed to depart.";
				waiting.hidden = true;
				cancelledPanel.hidden = false;
			});
			room.onMessage("lobby-error", (message: string) => {
				roomError.hidden = false;
				roomError.textContent = message;
			});
			room.onError((_code, message) => {
				if (!matchStarted) {
					roomError.hidden = false;
					roomError.textContent = message || "The lobby connection was interrupted.";
				}
			});
			room.onLeave((_code, reason) => {
				room = undefined;
				if (!matchStarted) {
					if (!cancelledPanel.hidden) return;
					waiting.hidden = true;
					setup.hidden = false;
					error.textContent = reason || "You left the lobby. Join again when ready.";
				}
			});
			sync(room.state);
		} catch (cause) {
			error.textContent = cause instanceof Error
				? "Could not connect to the lobby server: " + cause.message
				: "Could not connect to the lobby server.";
		} finally {
			connecting = false;
			submit.disabled = false;
		}
	}

	function sync(state: LobbyRoomView): void {
		// Render the authoritative room snapshot; the browser never decides when play starts.
		const players = Array.from(state.players.entries())
			.map(([sessionId, player]) => ({ sessionId, ...player }))
			.sort((a, b) => a.slot - b.slot);
		count.textContent = state.playerCount + " / " + state.teamSize + " PLAYERS";
		countdown.textContent = formatTime(state.secondsRemaining);
		if (state.status === "cancelled") {
			cancelReason.textContent = state.cancellationReason || "At least two players are needed to depart.";
			waiting.hidden = true;
			cancelledPanel.hidden = false;
			return;
		}
		slots.replaceChildren();

		for (let index = 0; index < state.teamSize; index++) {
			const player = players.find((entry) => entry.slot === index);
			slots.append(player ? joinedSlot(player, state.hostSessionId) : waitingSlot(index));
		}

		waitMessage.textContent = state.status === "waiting"
			? state.playerCount >= state.teamSize
				? "Crew ready — starting the game…"
				: "Waiting for other players to join your crew…"
			: "The crew is aboard. Starting the journey…";
		const isHost = state.hostSessionId === room?.sessionId;
		startNowButton.hidden = !isHost;
		startNowButton.textContent = "SKIP THE TIMER";
		hostHint.textContent = isHost
			? state.playerCount === 1
				? "You can depart solo now or wait for more crew."
				: "Skip the countdown and depart with everyone aboard."
			: state.playerCount === 1
				? "The host can start solo or wait for more crew."
				: "Only the crew host can choose departure.";

		if (state.status === "running" && !matchStarted) {
			startMatch({
				teamSize: state.teamSize,
				playerCount: state.startedPlayerCount,
				players: players.map(({ sessionId, name }) => ({ sessionId, name })),
			});
		}
	}

	function startMatch(match: StartedMatch): void {
		if (matchStarted) return;
		matchStarted = true;
		root.hidden = true;
		onMatchStart(match);
	}

	function joinedSlot(
		player: { sessionId: string; name: string; avatarIndex: number },
		hostSessionId: string,
	): HTMLElement {
		const card = document.createElement("article");
		card.className = "lobby-slot is-joined";
		const avatar = document.createElement("span");
		avatar.className = "lobby-avatar " + (avatarColors[player.avatarIndex % avatarColors.length] ?? "mint");
		avatar.setAttribute("aria-hidden", "true");
		avatar.textContent = player.name.slice(0, 1).toUpperCase();
		const details = document.createElement("span");
		details.className = "lobby-slot-details";
		const name = document.createElement("strong");
		name.textContent = player.name;
		const status = document.createElement("small");
		status.textContent = player.sessionId === hostSessionId ? "HOST · READY" : "JOINED · READY";
		details.append(name, status);
		const check = document.createElement("span");
		check.className = "lobby-check";
		check.setAttribute("aria-label", "Joined");
		check.textContent = "✓";
		card.append(avatar, details, check);
		return card;
	}

	function waitingSlot(index: number): HTMLElement {
		const card = document.createElement("article");
		card.className = "lobby-slot is-empty";
		const avatar = document.createElement("span");
		avatar.className = "lobby-avatar is-placeholder";
		avatar.setAttribute("aria-hidden", "true");
		avatar.textContent = "+";
		const details = document.createElement("span");
		details.className = "lobby-slot-details";
		const name = document.createElement("strong");
		name.textContent = "Player " + (index + 1);
		const status = document.createElement("small");
		status.textContent = "WAITING FOR PLAYER";
		details.append(name, status);
		card.append(avatar, details);
		return card;
	}

	async function leaveLobby(): Promise<void> {
		const activeRoom = room;
		room = undefined;
		if (activeRoom) await activeRoom.leave();
		waiting.hidden = true;
		setup.hidden = false;
		error.textContent = "You left the lobby. Join again when ready.";
	}

	return {
		destroy() {
			void room?.leave();
			root.remove();
		},
	};
}

function lobbyServerUrl(): string {
	const override = new URLSearchParams(window.location.search).get("lobby");
	if (override) return override;
	return window.location.protocol + "//" + (window.location.hostname || "127.0.0.1") + ":2567";
}

function formatTime(seconds: number): string {
	const safeSeconds = Math.max(0, seconds);
	return String(Math.floor(safeSeconds / 60)).padStart(2, "0")
		+ ":" + String(safeSeconds % 60).padStart(2, "0");
}
