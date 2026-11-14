// Integration test: a real platform host on a free port, real clients over WebSocket.
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@colyseus/sdk";
import { GAME_ROOM_NAME } from "@sdm/core/shared";
import { startTestServer, type TestServer } from "@sdm/host/testing";
import config from "../config/game.json";
import { hostGame, joinGame, type NetSession, type ServerAddress } from "../client/net.ts";
import { GAME_ROOM_MESSAGE, LOBBY_ROOM_NAME, type GameRoomMessage } from "../shared/lobby.ts";
import { CAR_FLOORS, SPAWN_CAR, contains } from "../shared/map.ts";
import { rooms } from "./index.ts";

interface LobbyView {
	teamSize: number;
	status: string;
	hostSessionId: string;
	playerCount: number;
	roomCode: string;
	gameRoomCode: string;
	startedPlayerCount: number;
}

let running: TestServer | undefined;
let open: Array<{ leave(): Promise<unknown> }> = [];

async function boot(): Promise<ServerAddress> {
	running = await startTestServer({ gameId: "team-2", config, rooms });
	return { http: running.url, ws: running.url.replace("http", "ws") };
}

async function waitFor(check: () => boolean, ms = 3000): Promise<void> {
	const end = Date.now() + ms;
	while (!check()) {
		if (Date.now() > end) throw new Error("timed out");
		await new Promise((r) => setTimeout(r, 20));
	}
}

const track = <T extends NetSession>(session: T): T => {
	open.push({ leave: () => session.stop() });
	return session;
};

afterEach(async () => {
	for (const connection of open) await connection.leave();
	open = [];
	await running?.shutdown();
	running = undefined;
});

describe("team-2 rooms on the platform host", () => {
	it("registers the game room and the lobby room", () => {
		expect(Object.keys(rooms).sort()).toEqual([GAME_ROOM_NAME, LOBBY_ROOM_NAME].sort());
	});

	it("two clients share one game room: join by code with a name, both see both players", async () => {
		const server = await boot();
		const host = track(await hostGame(server, "Ada"));
		expect(host.code).toHaveLength(4);
		const guest = track(await joinGame(server, host.code.toLowerCase(), "Bo"));
		expect(guest.code).toBe(host.code);
		expect(guest.playerId).not.toBe(host.playerId);

		await waitFor(() => host.state.players.size === 2 && guest.state.players.size === 2);
		for (const session of [host, guest]) {
			expect(session.state.seats.size).toBe(2);
			expect(session.state.players.get(host.playerId)?.name).toBe("Ada");
			expect(session.state.players.get(guest.playerId)?.name).toBe("Bo");
		}
		const ada = guest.state.players.get(host.playerId)!;
		const bo = host.state.players.get(guest.playerId)!;
		expect(contains(CAR_FLOORS[SPAWN_CAR]!, ada.x, ada.y)).toBe(true);
		expect(contains(CAR_FLOORS[SPAWN_CAR]!, bo.x, bo.y)).toBe(true);
		expect([ada.x, ada.y]).not.toEqual([bo.x, bo.y]);
	});

	it("a move input changes the server-side position the other client sees", async () => {
		const server = await boot();
		const host = track(await hostGame(server, "Ada"));
		const guest = track(await joinGame(server, host.code, "Bo"));
		await waitFor(() => host.state.players.has(guest.playerId) && guest.state.players.has(host.playerId));

		// What the host sees of the guest, and the other way round.
		const boSeenByHost = host.state.players.get(guest.playerId)!;
		const adaSeenByGuest = guest.state.players.get(host.playerId)!;
		const start = { x: boSeenByHost.x, y: boSeenByHost.y };
		const adaStart = { x: adaSeenByGuest.x, y: adaSeenByGuest.y };

		guest.send({ type: "move", mx: 1, my: 0, run: false });
		await waitFor(() => boSeenByHost.x > start.x + 10);
		expect(boSeenByHost.y).toBeCloseTo(start.y);
		expect(boSeenByHost.anim).toBe("walk");
		// The guest sees its own server-side position too, and nobody else moved.
		expect(guest.state.players.get(guest.playerId)!.x).toBeGreaterThan(start.x);
		expect(adaSeenByGuest.x).toBeCloseTo(adaStart.x);

		guest.send({ type: "move", mx: 0, my: 0, run: false });
		await waitFor(() => boSeenByHost.anim === "idle");
		const stoppedAt = boSeenByHost.x;
		await new Promise((r) => setTimeout(r, 200));
		expect(boSeenByHost.x).toBe(stoppedAt);

		host.send({ type: "move", mx: 0, my: -1, run: true });
		await waitFor(() => adaSeenByGuest.y < adaStart.y - 10);
	});

	it("removes a player from the state when they leave", async () => {
		const server = await boot();
		const host = track(await hostGame(server, "Ada"));
		const guest = await joinGame(server, host.code, "Bo");
		await waitFor(() => host.state.players.size === 2);
		await guest.stop();
		await waitFor(() => host.state.players.size === 1);
		expect(host.state.players.has(guest.playerId)).toBe(false);
	});

	it("rejects a join with an invalid name and an unknown code", async () => {
		const server = await boot();
		const host = track(await hostGame(server, "Ada"));
		await expect(joinGame(server, host.code, "x".repeat(17))).rejects.toMatchObject({ name: "JoinError", reason: "rejected" });
		await expect(joinGame(server, "ZZZZ", "Bo")).rejects.toMatchObject({ reason: "roomNotFound" });
		await new Promise((r) => setTimeout(r, 100));
		expect(host.state.players.size).toBe(1);
	});

	it("creates a private lobby and lets a friend join it using its room code", async () => {
		const server = await boot();
		await expect(new Client(server.ws).joinById<LobbyView>("unknown-room-code", { name: "Eli" }))
			.rejects.toThrow(/not found/i);
		const hostLobby = await new Client(server.ws).create<LobbyView>(LOBBY_ROOM_NAME, { name: "Ada", teamSize: 2 });
		const otherLobby = await new Client(server.ws).create<LobbyView>(LOBBY_ROOM_NAME, { name: "Cy", teamSize: 3 });
		open.push(hostLobby, otherLobby);
		hostLobby.onMessage("match-started", () => {});
		hostLobby.onMessage(GAME_ROOM_MESSAGE, () => {});
		otherLobby.onMessage("match-started", () => {});
		otherLobby.onMessage(GAME_ROOM_MESSAGE, () => {});
		expect(otherLobby.roomId).not.toBe(hostLobby.roomId);
		await waitFor(() => Boolean(hostLobby.state.roomCode) && Boolean(otherLobby.state.roomCode));
		expect(hostLobby.state.roomCode).toBe(hostLobby.roomId);
		expect(otherLobby.state.roomCode).toBe(otherLobby.roomId);

		const guestLobby = await new Client(server.ws).joinById<LobbyView>(hostLobby.state.roomCode, { name: "Bo" });
		open.push(guestLobby);
		guestLobby.onMessage("match-started", () => {});
		guestLobby.onMessage(GAME_ROOM_MESSAGE, () => {});
		expect(guestLobby.roomId).toBe(hostLobby.roomId);
		let received = "";
		guestLobby.onMessage(GAME_ROOM_MESSAGE, (message: GameRoomMessage) => {
			received = message.code;
		});
		// A full crew departs at once.
		await waitFor(() => hostLobby.state.status === "running" && guestLobby.state.status === "running");
		expect(hostLobby.state.hostSessionId).toBe(hostLobby.sessionId);
		expect(hostLobby.state.playerCount).toBe(2);
		await expect(new Client(server.ws).joinById<LobbyView>(hostLobby.roomId, { name: "Dee" }))
			.rejects.toThrow(/locked/i);

		// Only the host may announce the game room.
		guestLobby.send(GAME_ROOM_MESSAGE, { code: "FAKE" });
		const host = track(await hostGame(server, "Ada"));
		hostLobby.send(GAME_ROOM_MESSAGE, { code: host.code });
		await waitFor(() => received !== "");
		expect(received).toBe(host.code);
		await waitFor(() => hostLobby.state.gameRoomCode === host.code && guestLobby.state.gameRoomCode === host.code);

		const guest = track(await joinGame(server, received, "Bo"));
		await waitFor(() => host.state.players.size === 2);
		expect(guest.state.players.get(host.playerId)?.name).toBe("Ada");
		expect(host.state.phase).toBe("running");
	});

	it.each([2, 3, 4] as const)("auto-starts a full %i-player lobby and hands every player to one running game", async (teamSize) => {
		const server = await boot();
		const hostLobby = await new Client(server.ws).create<LobbyView>(LOBBY_ROOM_NAME, { name: "Ada", teamSize });
		open.push(hostLobby);
		hostLobby.onMessage("match-started", () => {});
		hostLobby.onMessage(GAME_ROOM_MESSAGE, () => {});
		const crewLobbies = [hostLobby];
		const names = ["Ada"];
		for (let index = 1; index < teamSize; index++) {
			const name = `Crew ${index + 1}`;
			names.push(name);
			const member = await new Client(server.ws).joinById<LobbyView>(hostLobby.roomId, { name });
			open.push(member);
			member.onMessage("match-started", () => {});
			member.onMessage(GAME_ROOM_MESSAGE, () => {});
			crewLobbies.push(member);
		}

		await waitFor(() => crewLobbies.every((member) => member.state.status === "running"));
		expect(crewLobbies.every((member) => member.state.playerCount === teamSize)).toBe(true);
		expect(crewLobbies.every((member) => member.state.startedPlayerCount === teamSize)).toBe(true);
		expect(crewLobbies.every((member) => !("secondsRemaining" in member.state))).toBe(true);

		// Simulate the host creating the game room after match-started. All crew clients
		// resolve from the durable state field, even when they subscribe after the event.
		const hostGameRoom = track(await hostGame(server, names[0]));
		hostLobby.send(GAME_ROOM_MESSAGE, { code: hostGameRoom.code });
		await waitFor(() => crewLobbies.every((member) => member.state.gameRoomCode === hostGameRoom.code));
		const gameSessions = [hostGameRoom];
		for (let index = 1; index < teamSize; index++) {
			gameSessions.push(track(await joinGame(server, crewLobbies[index]!.state.gameRoomCode, names[index])));
		}
		await waitFor(() => gameSessions.every((session) => session.state.players.size === teamSize));
		expect(gameSessions.every((session) => session.code === hostGameRoom.code)).toBe(true);
		expect(gameSessions.every((session) => session.state.phase === "running")).toBe(true);
		for (let index = 0; index < teamSize; index++) {
			expect(gameSessions[0]!.state.players.get(gameSessions[index]!.playerId)?.name).toBe(names[index]);
		}
	});

	it("lets the host start a partially filled lobby early", async () => {
		const server = await boot();
		const lobby = await new Client(server.ws).create<LobbyView>(LOBBY_ROOM_NAME, { name: "Ada", teamSize: 4 });
		open.push(lobby);
		lobby.onMessage("match-started", () => {});
		lobby.send("start-now");
		await waitFor(() => lobby.state.status === "running");
		expect(lobby.state.playerCount).toBe(1);
		expect(lobby.state.startedPlayerCount).toBe(1);
	});
});
