// Integration test: a real platform host on a free port, real clients over WebSocket.
import { afterEach, describe, expect, it } from "vitest";
import { Client, type Room } from "@colyseus/sdk";
import { GAME_ROOM_NAME } from "@sdm/core/shared";
import { startTestServer, type TestServer } from "@sdm/host/testing";
import config from "../config/game.json";
import { hostGame, joinGame, type NetSession, type ServerAddress } from "../client/net.ts";
import { GAME_ROOM_MESSAGE, LOBBY_ROOM_NAME, type GameRoomMessage } from "../shared/lobby.ts";
import { CAR_FLOORS, SPAWN_CAR, contains } from "../shared/map.ts";
import { configureMatchmaking, rooms } from "./index.ts";

interface LobbyView {
	status: string;
	hostSessionId: string;
	playerCount: number;
}

let running: TestServer | undefined;
let open: Array<{ leave(): Promise<unknown> }> = [];

async function boot(): Promise<ServerAddress> {
	running = await startTestServer({ gameId: "team-2", config, rooms });
	configureMatchmaking();
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

	it("lobby → game room: the lobby departs, the host's game room code reaches the crew", async () => {
		const server = await boot();
		const join = async (name: string, teamSize: number): Promise<Room<any, LobbyView>> => {
			const room = await new Client(server.ws).joinOrCreate<LobbyView>(LOBBY_ROOM_NAME, { name, teamSize });
			room.onMessage("match-started", () => {});
			room.onMessage(GAME_ROOM_MESSAGE, () => {});
			open.push(room);
			return room;
		};
		const hostLobby = await join("Ada", 2);
		// A different crew size gets its own lobby instead of being refused by this one.
		const otherLobby = await join("Cy", 3);
		expect(otherLobby.roomId).not.toBe(hostLobby.roomId);

		const guestLobby = await join("Bo", 2);
		expect(guestLobby.roomId).toBe(hostLobby.roomId);
		let received = "";
		guestLobby.onMessage(GAME_ROOM_MESSAGE, (message: GameRoomMessage) => {
			received = message.code;
		});
		// A full crew departs at once.
		await waitFor(() => hostLobby.state.status === "running" && guestLobby.state.status === "running");
		expect(hostLobby.state.hostSessionId).toBe(hostLobby.sessionId);

		// Only the host may announce the game room.
		guestLobby.send(GAME_ROOM_MESSAGE, { code: "FAKE" });
		const host = track(await hostGame(server, "Ada"));
		hostLobby.send(GAME_ROOM_MESSAGE, { code: host.code });
		await waitFor(() => received !== "");
		expect(received).toBe(host.code);

		const guest = track(await joinGame(server, received, "Bo"));
		await waitFor(() => host.state.players.size === 2);
		expect(guest.state.players.get(host.playerId)?.name).toBe("Ada");
	});
});
