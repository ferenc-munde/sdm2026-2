import { describe, expect, it } from "vitest";
import { COAL_FUEL } from "../constants.ts";
import { COURSE_INTERVAL_SECONDS } from "./courseTrigger.ts";
import { platformSpawn } from "../map/platform.ts";
import type { ClientMessage } from "../messages.ts";
import type { PlayerId, Vec2 } from "../types.ts";
import {
  createRoom,
  createRoomWorld,
  disconnectFromRoom,
  handleMessage,
  leaveRoom,
  parseClientMessage,
  roomView,
  stepRoom,
  type Room,
  type RoomResult,
} from "./room.ts";

const world = createRoomWorld();
const TICK = 1 / 20;

const ok = (result: RoomResult): Room => {
  if (!result.ok) throw new Error(`refused: ${result.error} ${result.message ?? ""}`);
  return result.room;
};
const send = (room: Room, id: PlayerId, message: ClientMessage): Room => ok(handleMessage(room, id, message, world));
const station = (kind: string): Vec2 => world.train.stations.find((s) => s.kind === kind)!.position;
/** Puts a player somewhere directly, as if they had walked there. */
const at = (room: Room, id: PlayerId, position: Vec2): Room => {
  const { session } = room.lobby;
  const player = session.state.players[id]!;
  const players = { ...session.state.players, [id]: { ...player, position: { ...position } } };
  return { ...room, lobby: { ...room.lobby, session: { ...session, state: { ...session.state, players } } } };
};
const ticks = (room: Room, count: number): Room => {
  let next = room;
  for (let i = 0; i < count; i++) next = stepRoom(next, TICK, world);
  return next;
};

/** A room with a host and one crew member, crew size 2, ready to depart. */
function readyRoom(seed = 1): Room {
  let room = createRoom("ROOM", seed, world);
  room = send(room, "host", { type: "createRoom", name: "Ada" });
  room = send(room, "crew", { type: "joinRoom", name: "Bo", code: "ROOM" });
  return send(room, "host", { type: "configureRoom", crewSize: 2 });
}

describe("createRoom", () => {
  it("uses a given random source, so the platform's seeded random drives the hazards", () => {
    let calls = 0;
    const random = { next: () => { calls += 1; return 0.5; } };
    let room = createRoom("ROOM", random, world);
    room = send(room, "host", { type: "createRoom", name: "Ada" });
    room = send(room, "crew", { type: "joinRoom", name: "Bo", code: "ROOM" });
    room = send(send(room, "host", { type: "configureRoom", crewSize: 2 }), "host", { type: "startGame" });
    ticks(room, 400); // 20 seconds: the director starts at least one hazard
    expect(calls).toBeGreaterThan(0);
  });
});

describe("parseClientMessage", () => {
  it("accepts every well-formed message and drops extra fields", () => {
    expect(parseClientMessage({ type: "input", direction: { dx: 1, dy: -1 }, interacting: true, cheat: 1 }))
      .toEqual({ type: "input", direction: { dx: 1, dy: -1 }, interacting: true });
    expect(parseClientMessage({ type: "joinRoom", name: "Bo", code: "K7QF" })).toEqual({ type: "joinRoom", name: "Bo", code: "K7QF" });
    expect(parseClientMessage({ type: "configureRoom", crewSize: 3 })).toEqual({ type: "configureRoom", crewSize: 3 });
    for (const type of ["startGame", "pickUpOrDrop", "throw", "playAgain"] as const) {
      expect(parseClientMessage({ type })).toEqual({ type });
    }
  });

  it("refuses malformed messages", () => {
    for (const raw of [
      null, 42, "input", [], {}, { type: "teleport" },
      { type: "input", direction: { dx: 2, dy: 0 }, interacting: false },
      { type: "input", direction: { dx: 0, dy: 0 }, interacting: "yes" },
      { type: "input", interacting: false },
      { type: "createRoom" }, { type: "createRoom", name: 7 }, { type: "createRoom", name: "x".repeat(500) },
      { type: "joinRoom", name: "Bo" }, { type: "configureRoom", crewSize: "3" },
    ]) {
      expect(parseClientMessage(raw)).toBeNull();
    }
  });
});

describe("the lobby", () => {
  it("seats players on the platform starts in join order, and a rejoin keeps the seat", () => {
    let room = readyRoom();
    const players = room.lobby.session.state.players;
    expect(players.host!.position).toEqual(platformSpawn(world.platform, 0));
    expect(players.crew!.position).toEqual(platformSpawn(world.platform, 1));
    room = disconnectFromRoom(room, "crew");
    room = send(room, "crew", { type: "joinRoom", name: "Bo", code: "ROOM" });
    expect(room.lobby.session.state.players.crew).toMatchObject({ connected: true, position: platformSpawn(world.platform, 1) });
  });

  it("never seats a new player on top of another after a middle seat leaves", () => {
    let room = readyRoom();
    room = send(room, "host", { type: "configureRoom", crewSize: 4 });
    room = send(room, "third", { type: "joinRoom", name: "Cy", code: "ROOM" });
    room = leaveRoom(room, "crew"); // the middle seat leaves
    room = send(room, "fourth", { type: "joinRoom", name: "Di", code: "ROOM" });
    const players = Object.values(room.lobby.session.state.players);
    expect(players.map((p) => p.id).sort()).toEqual(["fourth", "host", "third"]);
    for (const a of players) {
      for (const b of players) {
        if (a.id < b.id) expect(Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y)).toBeGreaterThan(0);
      }
    }
    expect(room.lobby.session.state.players.fourth!.position).toEqual(platformSpawn(world.platform, 1));
  });

  it("walks players on the platform by their input", () => {
    let room = send(readyRoom(), "host", { type: "input", direction: { dx: 1, dy: 0 }, interacting: false });
    const before = room.lobby.session.state.players.host!.position.x;
    room = ticks(room, 10);
    expect(room.lobby.session.state.players.host!.position.x).toBeGreaterThan(before);
    expect(roomView(room, world).phase).toBe("lobby");
  });

  it("only lets the host depart, then boards everyone with the tools on their racks", () => {
    const room = readyRoom();
    expect(handleMessage(room, "crew", { type: "startGame" }, world)).toMatchObject({ ok: false, error: "notHost" });
    const boarded = send(room, "host", { type: "startGame" });
    const state = roomView(boarded, world);
    expect(state.phase).toBe("playing");
    expect(state.players.host!.position).toEqual(world.train.playerSpawns[0]);
    expect(state.players.crew!.position).toEqual(world.train.playerSpawns[1]);
    expect(Object.values(state.items).map((item) => item.kind).sort()).toEqual(["extinguisher", "wrench"]);
  });

  it("keeps a held direction across the departure, so nobody stands frozen on the train", () => {
    let room = send(readyRoom(), "crew", { type: "input", direction: { dx: 1, dy: 0 }, interacting: false });
    room = send(room, "host", { type: "startGame" });
    const start = room.lobby.session.state.players.crew!.position.x;
    room = ticks(room, 10);
    expect(room.lobby.session.state.players.crew!.position.x).toBeGreaterThan(start);
  });

  it("refuses to throw on the platform", () => {
    expect(handleMessage(readyRoom(), "host", { type: "throw" }, world)).toMatchObject({ ok: false, error: "invalidMessage" });
  });
});

describe("a run", () => {
  it("takes coal at the dispenser and delivers it at the engine", () => {
    let room = send(readyRoom(), "host", { type: "startGame" });
    room = at(room, "host", station("coalDispenser"));
    room = send(room, "host", { type: "pickUpOrDrop" });
    const coal = room.lobby.session.state.players.host!.heldItem;
    expect(room.lobby.session.state.items[coal!]?.kind).toBe("coal");

    room = ticks(room, 40); // two seconds of fuel drain
    const fuel = room.lobby.session.state.journey.fuel;
    room = at(room, "host", station("engine"));
    room = send(room, "host", { type: "pickUpOrDrop" });
    expect(room.lobby.session.state.journey.fuel).toBeCloseTo(Math.min(100, fuel + COAL_FUEL));
    expect(room.lobby.session.state.players.host!.heldItem).toBeNull();
  });

  it("throws a held item, which flies and then lands", () => {
    let room = send(readyRoom(), "host", { type: "startGame" });
    const wrench = Object.values(room.lobby.session.state.items).find((item) => item.kind === "wrench")!;
    room = at(room, "host", wrench.position);
    room = send(room, "host", { type: "pickUpOrDrop" });
    expect(room.lobby.session.state.players.host!.heldItem).toBe(wrench.id);

    room = send(room, "host", { type: "throw" });
    const start = room.lobby.session.state.items[wrench.id]!.position;
    room = ticks(room, 40);
    const landed = room.lobby.session.state.items[wrench.id]!;
    expect(landed.heldBy).toBeNull();
    expect(landed.velocity).toEqual({ x: 0, y: 0 });
    expect(Math.hypot(landed.position.x - start.x, landed.position.y - start.y)).toBeGreaterThan(0);
  });

  it("starts a course event at the course interval", () => {
    // A perfect crew: every breach and fire is fixed the moment it starts, so the hull lasts.
    const fixEverything = (room: Room, count: number): Room => {
      let next = room;
      for (let i = 0; i < count; i++) {
        next = stepRoom(next, TICK, world);
        const { session } = next.lobby;
        const hazards = Object.fromEntries(Object.entries(session.state.hazards).filter(([, h]) => h.kind === "course"));
        next = { ...next, lobby: { ...next.lobby, session: { ...session, state: { ...session.state, hazards } } } };
      }
      return next;
    };
    let room = send(readyRoom(), "host", { type: "startGame" });
    room = fixEverything(room, Math.round(COURSE_INTERVAL_SECONDS / TICK) - 2);
    const course = () => Object.values(room.lobby.session.state.hazards).some((hazard) => hazard.kind === "course");
    expect(course()).toBe(false);
    room = fixEverything(room, 3);
    expect(room.lobby.session.state.phase).toBe("playing");
    expect(course()).toBe(true);
  });

  it("goes back to a fresh platform after play again", () => {
    let room = send(readyRoom(), "host", { type: "startGame" });
    const lost = { ...room.lobby.session.state, phase: "lost" as const };
    room = { ...room, lobby: { ...room.lobby, session: { ...room.lobby.session, state: lost } } };
    room = send(room, "crew", { type: "playAgain" });
    const state = roomView(room, world);
    expect(state.phase).toBe("lobby");
    expect(state.players.host!.position).toEqual(platformSpawn(world.platform, 0));
    expect(room.lobby.practice.breach?.id).toBe("practice-breach");
  });

  it("is deterministic: the same seed and messages give the same run", () => {
    const play = (seed: number) => {
      let room = send(readyRoom(seed), "host", { type: "startGame" });
      room = send(room, "crew", { type: "input", direction: { dx: 0, dy: 1 }, interacting: true });
      return roomView(ticks(room, 600), world); // 30 seconds
    };
    expect(play(7)).toEqual(play(7));
    expect(Object.keys(play(7).hazards).length).toBeGreaterThan(0);
  });
});

describe("dash through the room (#228)", () => {
  it("dashes on throw with empty hands, and cools down", () => {
    let room = send(readyRoom(), "host", { type: "startGame" });
    const start = room.lobby.session.state.players.host!.position;
    room = send(room, "host", { type: "throw" });
    expect(room.lobby.session.state.players.host!.dashSeconds).toBeGreaterThan(0);
    room = ticks(room, 4);
    const moved = room.lobby.session.state.players.host!.position;
    expect(Math.hypot(moved.x - start.x, moved.y - start.y)).toBeGreaterThan(50);
    const again = send(room, "host", { type: "throw" });
    expect(again.lobby.session.state.players.host!.position).toEqual(moved); // still cooling down
  });
});
