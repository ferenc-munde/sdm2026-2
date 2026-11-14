import { describe, expect, it } from "vitest";
import { addLobbyPlayer, createLobbyState, removeLobbyPlayer, startLobby } from "./lobby.ts";

describe("multiplayer lobby rules", () => {
	it("assigns the first player as host and tracks the crew without a countdown", () => {
		const state = createLobbyState(4);

		expect(addLobbyPlayer(state, "a", " Rawan ")).toBe(true);
		expect(addLobbyPlayer(state, "b", "Shahd")).toBe(true);
		expect(state.players.get("a")?.name).toBe("Rawan");
		expect(state.players.get("a")?.isHost).toBe(true);
		expect(state.players.get("b")?.isHost).toBe(false);
		expect(state.playerCount).toBe(2);
		expect("secondsRemaining" in state).toBe(false);
		expect(state.status).toBe("waiting");
	});

	it.each([2, 3, 4] as const)("starts automatically when all %i crew seats fill", (teamSize) => {
		const state = createLobbyState(teamSize);
		for (let index = 0; index < teamSize - 1; index++) {
			expect(addLobbyPlayer(state, `p${index}`, `Player ${index + 1}`)).toBe(true);
			expect(state.status).toBe("waiting");
		}

		expect(addLobbyPlayer(state, `p${teamSize - 1}`, `Player ${teamSize}`)).toBe(true);
		expect(state.status).toBe("running");
		expect(state.startedPlayerCount).toBe(teamSize);
		expect(addLobbyPlayer(state, "late", "Late player")).toBe(false);
	});

	it("lets the host start early with the current crew, including one player", () => {
		const solo = createLobbyState(4);
		addLobbyPlayer(solo, "a", "A");
		expect(startLobby(solo)).toBe(true);
		expect(solo.status).toBe("running");
		expect(solo.startedPlayerCount).toBe(1);

		const crew = createLobbyState(4);
		addLobbyPlayer(crew, "a", "A");
		addLobbyPlayer(crew, "b", "B");
		expect(startLobby(crew)).toBe(true);
		expect(crew.startedPlayerCount).toBe(2);
	});

	it("does not start an empty lobby", () => {
		const state = createLobbyState(2);
		expect(startLobby(state)).toBe(false);
		expect(state.status).toBe("waiting");
	});

	it("reassigns the host when they leave and clears an empty waiting room", () => {
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
	});
});
