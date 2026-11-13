import { describe, expect, it } from "vitest";
import { PLAYER_RADIUS } from "../constants.ts";
import { carAt, createTrainMap, insideBox } from "../map/map.ts";
import { createPlatformMap, OBJECT_SPACING, platformObjects, platformSpawn, validatePlatform } from "../map/platform.ts";
import { hitsWall } from "../movement/movement.ts";
import { createPlatformPractice, useDepartureLever } from "../stations/platform.ts";
import type { Direction } from "../types.ts";
import { departAndBoard, playAgainOnPlatform, stepLobby } from "./boarding.ts";
import { canDepart } from "./lobby.ts";
import {
  applyInput,
  configureRoom,
  createSession,
  joinSession,
  type GameSession,
  type SessionResult,
} from "./session.ts";

const train = createTrainMap();
const platform = createPlatformMap();
const ok = (result: SessionResult): GameSession => {
  expect(result.ok).toBe(true);
  return result.session;
};
/** A room whose players joined in order, each at their platform start. */
const room = (...ids: string[]): GameSession =>
  ids.reduce((s, id, seat) => ok(joinSession(s, id, id.toUpperCase(), platformSpawn(platform, seat))), createSession("ROOM"));
const hold = (s: GameSession, id: string, dx: Direction["dx"], dy: Direction["dy"]): GameSession =>
  ok(applyInput(s, id, { direction: { dx, dy }, interacting: false }));
const walk = (s: GameSession, seconds: number): GameSession => {
  let next = s;
  for (let t = 0; t < Math.round(seconds * 20); t++) next = stepLobby(next, 1 / 20, platform);
  return next;
};

describe("platform map", () => {
  it("is valid: starts and objects on the floor, nothing overlapping", () => {
    expect(validatePlatform(platform)).toEqual([]);
  });

  it("has every object #153 needs, far enough apart to use one at a time", () => {
    const names = platformObjects(platform).map((o) => o.name);
    expect(names).toEqual(expect.arrayContaining(["departure lever", "coal pile", "boiler", "wrench", "breach", "board 1"]));
    const all = platformObjects(platform);
    for (const a of all) for (const b of all) if (a !== b) expect(Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y)).toBeGreaterThanOrEqual(OBJECT_SPACING);
  });

  it("finds problems: an object off the platform, objects on top of each other", () => {
    const broken = createPlatformMap();
    broken.objects.departureLever = { x: 2000, y: 0 };
    broken.objects.boiler = { ...broken.objects.coalPile };
    const problems = validatePlatform(broken);
    expect(problems).toContain("departure lever is not on the platform");
    expect(problems).toContain("coal pile and boiler are too close");
  });

  it("works as the layout for the platform objects (#153)", () => {
    const practice = createPlatformPractice(platform.objects);
    expect(practice.items["practice-wrench"]?.position).toEqual(platform.objects.wrench);
    expect(practice.breach?.position).toEqual(platform.objects.breach);
  });
});

describe("walking in the lobby", () => {
  it("moves each player on the platform by their own keys", () => {
    let s = hold(hold(room("ada", "bo"), "ada", 1, 0), "bo", 0, -1);
    const before = s.state.players;
    s = walk(s, 0.5);
    expect(s.state.players.ada!.position.x).toBeGreaterThan(before.ada!.position.x);
    expect(s.state.players.bo!.position.y).toBeLessThan(before.bo!.position.y);
  });

  it("stops at the train and the platform ends, never leaving the floor", () => {
    let s = hold(hold(room("ada", "bo"), "ada", 0, -1), "bo", -1, 1);
    s = walk(s, 5);
    for (const player of Object.values(s.state.players)) {
      expect(hitsWall(platform, player.position)).toBe(false);
      expect(insideBox(platform.floor, player.position, PLAYER_RADIUS - 0.01)).toBe(true);
    }
  });

  it("does nothing once the run has started", () => {
    const ready = ok(configureRoom(room("ada", "bo"), "ada", 2));
    // Hold a key after the start (departing clears inputs), so only the phase check stops it.
    const playing = hold(ok(departAndBoard(ready, "ada", train)), "ada", 1, 0);
    expect(stepLobby(playing, 1, platform)).toBe(playing);
  });
});

describe("departing and boarding", () => {
  it("boards the crew at the train's starts in join order, with the tools on their racks", () => {
    const ready = ok(configureRoom(room("ada", "bo", "cy"), "ada", 3));
    const s = ok(departAndBoard(ready, "ada", train));
    expect(s.state.phase).toBe("playing");
    expect(s.state.players.ada!.position).toEqual(train.playerSpawns[0]);
    expect(s.state.players.bo!.position).toEqual(train.playerSpawns[1]);
    expect(s.state.players.cy!.position).toEqual(train.playerSpawns[2]);
    for (const p of Object.values(s.state.players)) expect(carAt(train, p.position)).not.toBeNull();
    expect(Object.keys(s.state.items).sort()).toEqual(["extinguisher", "wrench"]);
  });

  it("stays on the platform when the departure is refused", () => {
    const waiting = ok(configureRoom(room("ada", "bo"), "ada", 3));
    const result = departAndBoard(waiting, "ada", train);
    expect(result.ok).toBe(false);
    expect(result.session).toBe(waiting);
  });

  it("works through the departure lever (#153): host at the lever, crew complete", () => {
    const ready = ok(configureRoom(room("ada", "bo"), "ada", 2));
    const atLever = {
      ...ready,
      state: { ...ready.state, players: { ...ready.state.players, ada: { ...ready.state.players.ada!, position: { ...platform.objects.departureLever } } } },
    };
    const rules = {
      canDepart: (s: GameSession, id: string) => canDepart(s.state, id),
      start: (s: GameSession, id: string) => {
        const r = departAndBoard(s, id, train);
        return r.ok ? { ok: true as const, session: r.session } : { ok: false as const, session: s, message: r.error };
      },
    };
    const farAway = useDepartureLever(ready, ready.state, ready.state.lobby.hostId, "ada", platform.objects, rules);
    expect(farAway.ok).toBe(false);
    const pulled = useDepartureLever(atLever, atLever.state, atLever.state.lobby.hostId, "ada", platform.objects, rules);
    expect(pulled.ok).toBe(true);
    expect(pulled.session.state.phase).toBe("playing");
  });
});

describe("play again", () => {
  it("puts the crew back on the platform at their starts, with nothing in hand", () => {
    const ready = ok(configureRoom(room("ada", "bo"), "ada", 2));
    const boarded = ok(departAndBoard(ready, "ada", train));
    const over = { ...boarded, state: { ...boarded.state, phase: "lost" as const } };
    const back = ok(playAgainOnPlatform(over, platform));
    expect(back.state.phase).toBe("lobby");
    expect(back.state.players.ada!.position).toEqual(platformSpawn(platform, 0));
    expect(back.state.players.bo!.position).toEqual(platformSpawn(platform, 1));
    expect(back.state.items).toEqual({});
    expect(back.state.lobby).toEqual({ hostId: "ada", crewSize: 2 });
  });
});
