import { Client as ColyseusClient, type Room } from "@colyseus/sdk";
import {
	GAME_ROOM_MESSAGE,
	isLobbyCountdownUrgent,
	LOBBY_ROOM_NAME,
	type GameRoomMessage,
} from "../shared/lobby.ts";
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
	roomCode: string;
	cancellationReason: string;
	players: Map<string, LobbyPlayerView>;
}

export interface StartedMatch {
	teamSize: number;
	playerCount: number;
	players: Array<{ sessionId: string; name: string }>;
}

/**
 * What the game needs when the lobby departs. The lobby and the game are two rooms: the host
 * creates the game room and tells the lobby its code, the lobby passes it on to the crew.
 */
export interface LobbyDeparture extends StartedMatch {
	/** The name this player entered in the lobby. */
	name: string;
	/** True for the lobby host, who creates the game room. */
	isHost: boolean;
	/** Host: report the code of the game room just created. */
	shareGameCode(code: string): void;
	/** Crew: resolves with the code the host reported. */
	gameCode: Promise<string>;
	/** Leave the lobby room once this player sits in the game room. */
	leaveLobby(): void;
}

const avatarColors = ["mint", "coral", "gold", "blue"];

export function mountLobby(
	parent: HTMLElement,
	onMatchStart: (match: LobbyDeparture) => void,
	serverUrl: string = lobbyServerUrl(),
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
						<div class="lobby-room-choices" data-room-choices>
							<p class="lobby-label">How would you like to play?</p>
							<button class="lobby-primary" type="button" data-choose-create>Create a Room</button>
							<button class="lobby-secondary" type="button" data-choose-join>Join a Room</button>
						</div>
						<div class="lobby-room-step" data-create-step hidden>
							<label class="lobby-label" for="lobby-team-size">Crew size</label>
							<select id="lobby-team-size" name="teamSize">
								<option value="2">2 players</option>
								<option value="3">3 players</option>
								<option value="4" selected>4 players</option>
							</select>
							<button class="lobby-primary" type="button" data-create-room>Create Room</button>
							<button class="lobby-back" type="button" data-back>Back</button>
						</div>
						<div class="lobby-room-step" data-join-step hidden>
							<label class="lobby-label" for="lobby-room-code">Enter your room code</label>
							<input id="lobby-room-code" name="roomCode" maxlength="20" autocomplete="off"
								placeholder="Room code">
							<button class="lobby-primary" type="button" data-join-room>Join Room</button>
							<button class="lobby-back" type="button" data-back>Back</button>
						</div>
						<p class="lobby-error" role="alert" aria-live="polite"></p>
					</form>
					<p class="lobby-footnote">Bring your crew together before the train departs.</p>
				</section>
				<section class="lobby-waiting" aria-label="Waiting room" hidden>
					<div class="lobby-room-heading">
						<div>
							<p class="lobby-kicker">CREW ASSEMBLY</p>
							<h2>Waiting for departure</h2>
						</div>
						<span class="lobby-count" data-player-count>0 / 4 PLAYERS</span>
					</div>
					<div class="lobby-room-code" data-room-code-panel hidden>
						<span>SHARE THIS ROOM CODE</span>
						<strong data-room-code aria-label="Room code"></strong>
					</div>
					<div class="lobby-countdown" aria-live="polite">
						<span class="countdown-icon" aria-hidden="true">◷</span>
						<div><small>TRAIN DEPARTS IN</small><strong data-countdown>02:00</strong></div>
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
	const roomChoices = root.querySelector<HTMLElement>("[data-room-choices]")!;
	const createStep = root.querySelector<HTMLElement>("[data-create-step]")!;
	const joinStep = root.querySelector<HTMLElement>("[data-join-step]")!;
	const createChoice = root.querySelector<HTMLButtonElement>("[data-choose-create]")!;
	const joinChoice = root.querySelector<HTMLButtonElement>("[data-choose-join]")!;
	const createButton = root.querySelector<HTMLButtonElement>("[data-create-room]")!;
	const joinButton = root.querySelector<HTMLButtonElement>("[data-join-room]")!;
	const roomCodeInput = root.querySelector<HTMLInputElement>("#lobby-room-code")!;
	const roomCodePanel = root.querySelector<HTMLElement>("[data-room-code-panel]")!;
	const roomCodeLabel = root.querySelector<HTMLElement>("[data-room-code]")!;
	const count = root.querySelector<HTMLElement>("[data-player-count]")!;
	const countdown = root.querySelector<HTMLElement>("[data-countdown]")!;
	const countdownPanel = root.querySelector<HTMLElement>(".lobby-countdown")!;
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
	let playerName = "";
	let resolveGameCode: (code: string) => void = () => {};
	const gameCode = new Promise<string>((resolve) => {
		resolveGameCode = resolve;
	});

	form.addEventListener("submit", (event) => event.preventDefault());
	createChoice.addEventListener("click", () => showSetupStep("create"));
	joinChoice.addEventListener("click", () => showSetupStep("join"));
	createButton.addEventListener("click", () => void connect("create"));
	joinButton.addEventListener("click", () => void connect("join"));
	root.querySelectorAll<HTMLButtonElement>("[data-back]").forEach((button) => {
		button.addEventListener("click", () => showSetupStep("choices"));
	});
	leaveButton.addEventListener("click", () => void leaveLobby());
	startNowButton.addEventListener("click", () => room?.send("start-now"));
	root.querySelector<HTMLButtonElement>("[data-return]")!.addEventListener("click", () => void leaveLobby());

	async function connect(mode: "create" | "join"): Promise<void> {
		const name = nameInput.value.trim();
		const teamSize = Number(sizeInput.value);
		const roomCode = roomCodeInput.value.trim();
		if (!name || name.length > 16 || (mode === "create" && ![2, 3, 4].includes(teamSize))) {
			error.textContent = "Enter a player name" + (mode === "create" ? " and choose a crew size." : ".");
			return;
		}
		if (mode === "join" && !roomCode) {
			error.textContent = "Enter the room code shared by the host.";
			return;
		}
		if (connecting) return;

		connecting = true;
		createButton.disabled = true;
		joinButton.disabled = true;
		error.textContent = mode === "create" ? "Preparing a private crew room…" : "Looking for that crew room…";
		try {
			const client = new ColyseusClient(serverUrl);
			room = mode === "create"
				? await client.create<LobbyRoomView>(LOBBY_ROOM_NAME, { teamSize, name })
				: await client.joinById<LobbyRoomView>(roomCode, { name });
			playerName = name;
			error.textContent = "";
			setup.hidden = true;
			waiting.hidden = false;
			room.onStateChange(sync);
			room.onMessage("match-started", (match: StartedMatch) => startMatch(match));
			room.onMessage(GAME_ROOM_MESSAGE, (message: GameRoomMessage) => resolveGameCode(message.code));
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
					showSetupStep("choices");
					error.textContent = reason || "You left the lobby. Join again when ready.";
				}
			});
			sync(room.state);
		} catch (cause) {
			const details = cause instanceof Error ? cause.message : "";
			const reason = String((cause as { reason?: unknown } | null)?.reason ?? "").toLowerCase();
			error.textContent = reason.includes("full") || /room.?full|full room|room .* locked/i.test(details)
				? "That room is full or has already departed. Ask the host for another room."
				: reason.includes("notfound") || /not found|does not exist/i.test(details)
					? "Room code not found. Check the code and try again."
					: details ? "Could not connect to the room: " + details : "Could not connect to the room.";
		} finally {
			connecting = false;
			createButton.disabled = false;
			joinButton.disabled = false;
		}
	}

	function sync(state: LobbyRoomView): void {
		// Render the authoritative room snapshot; the browser never decides when play starts.
		const players = Array.from(state.players.entries())
			.map(([sessionId, player]) => ({ sessionId, ...player }))
			.sort((a, b) => a.slot - b.slot);
		count.textContent = state.playerCount + " / " + state.teamSize + " PLAYERS";
		countdown.textContent = formatTime(state.secondsRemaining);
		countdownPanel.classList.toggle("is-urgent", isLobbyCountdownUrgent(state.secondsRemaining));
		const isHost = state.hostSessionId === room?.sessionId;
		roomCodePanel.hidden = !isHost;
		if (isHost) roomCodeLabel.textContent = state.roomCode || room?.roomId || "Connecting…";
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
		const lobbyRoom = room;
		onMatchStart({
			...match,
			name: playerName,
			isHost: lobbyRoom !== undefined && lobbyRoom.state.hostSessionId === lobbyRoom.sessionId,
			shareGameCode: (code) => lobbyRoom?.send(GAME_ROOM_MESSAGE, { code } satisfies GameRoomMessage),
			gameCode,
			leaveLobby: () => {
				room = undefined;
				void lobbyRoom?.leave();
			},
		});
	}

	function showSetupStep(step: "choices" | "create" | "join"): void {
		roomChoices.hidden = step !== "choices";
		createStep.hidden = step !== "create";
		joinStep.hidden = step !== "join";
		error.textContent = "";
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
		showSetupStep("choices");
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
