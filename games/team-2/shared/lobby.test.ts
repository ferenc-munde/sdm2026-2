import { describe, expect, it } from "vitest";
import {
	addLobbyPlayer,
	advanceLobbyCountdown,
	createLobbyState,
	LOBBY_COUNTDOWN_SECONDS,
	removeLobbyPlayer,
	startLobby,
} from "./lobby.ts";

describe("multiplayer lobby rules", () => {
	it("assigns the first player as host and tracks open slots", () => {
		const state = createLobbyState(4);

		expect(addLobbyPlayer(state, "a", " Rawan ")).toBe(true);
		expect(addLobbyPlayer(state, "b", "Shahd")).toBe(true);
		expect(state.players.get("a")?.name).toBe("Rawan");
		expect(state.players.get("a")?.isHost).toBe(true);
		expect(state.players.get("b")?.isHost).toBe(false);
		expect(state.playerCount).toBe(2);
		expect(state.secondsRemaining).toBe(LOBBY_COUNTDOWN_SECONDS);
	});

	it("starts as soon as the selected team size joins and rejects late joins", () => {
		const state = createLobbyState(2);

		addLobbyPlayer(state, "a", "A");
		addLobbyPlayer(state, "b", "B");

		expect(state.status).toBe("running");
		expect(state.startedPlayerCount).toBe(2);
		expect(addLobbyPlayer(state, "c", "C")).toBe(false);
		expect(startLobby(state)).toBe(false);
	});

	it("lets the host start early with the current crew, but never with one player", () => {
		const solo = createLobbyState(4);
		addLobbyPlayer(solo, "a", "A");
		expect(startLobby(solo)).toBe(false);
		expect(solo.status).toBe("waiting");

		const crew = createLobbyState(4);
		addLobbyPlayer(crew, "a", "A");
		addLobbyPlayer(crew, "b", "B");
		expect(startLobby(crew)).toBe(true);
		expect(crew.startedPlayerCount).toBe(2);
	});

	it("cancels after 120 seconds if only one player joined", () => {
		const state = createLobbyState(4);
		addLobbyPlayer(state, "a", "A");

		for (let second = 0; second < LOBBY_COUNTDOWN_SECONDS - 1; second++) {
			expect(advanceLobbyCountdown(state)).toBe(false);
		}
		expect(state.secondsRemaining).toBe(1);
		expect(state.status).toBe("waiting");

		expect(advanceLobbyCountdown(state)).toBe(false);
		expect(state.status).toBe("cancelled");
		expect(state.cancellationReason).toContain("two players");
		expect(state.startedPlayerCount).toBe(0);
	});

	it("starts with all joined players when the countdown expires with a crew", () => {
		const state = createLobbyState(4);
		addLobbyPlayer(state, "a", "A");
		addLobbyPlayer(state, "b", "B");

		for (let second = 0; second < LOBBY_COUNTDOWN_SECONDS; second++) advanceLobbyCountdown(state);
		expect(state.status).toBe("running");
		expect(state.startedPlayerCount).toBe(2);
	});

	it("does not start when the room has no players", () => {
		const state = createLobbyState(2);
		for (let second = 0; second < LOBBY_COUNTDOWN_SECONDS + 1; second++) {
			expect(advanceLobbyCountdown(state)).toBe(false);
		}
		expect(startLobby(state)).toBe(false);
		expect(state.status).toBe("waiting");
	});

	it("reassigns the host when they leave and resets an empty waiting room", () => {
		const state = createLobbyState(4);
		addLobbyPlayer(state, "a", "A");
		addLobbyPlayer(state, "b", "B");
		addLobbyPlayer(state, "c", "C");

		removeLobbyPlayer(state, "a");
		expect(state.hostSessionId).toBe("b");
		expect(state.players.get("b")?.isHost).toBe(true);
		expect(state.players.get("c")?.isHost).toBe(false);

		removeLobbyPlayer(state, "b");
		removeLobbyPlayer(state, "c");
		expect(state.playerCount).toBe(0);
		expect(state.hostSessionId).toBe("");
		expect(state.secondsRemaining).toBe(LOBBY_COUNTDOWN_SECONDS);
	});
});\n
