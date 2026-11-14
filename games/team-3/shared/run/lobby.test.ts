import { describe, expect, it } from "vitest";
import { MAX_PLAYERS } from "../constants.ts";
import { canDepart, isRoomFull, newLobby } from "./lobby.ts";
import {
  configureRoom,
  createSession,
  departSession,
  disconnectFromSession,
  joinSession,
  leaveSession,
  type GameSession,
  type SessionResult,
} from "./session.ts";

const ok = (result: SessionResult): GameSession => {
  expect(result.ok).toBe(true);
  return result.session;
};
const refused = (result: SessionResult) => (result.ok ? "accepted" : result.error);

/** A room with the given players joined in order. */
const room = (...ids: string[]): GameSession =>
  ids.reduce((s, id) => ok(joinSession(s, id, id.toUpperCase())), createSession("ROOM"));

describe("new room", () => {
  it("has no host and room for a full crew", () => {
    expect(newLobby()).toEqual({ hostId: null, crewSize: MAX_PLAYERS });
    expect(createSession("ROOM").state.lobby).toEqual(newLobby());
  });
});

describe("host", () => {
  it("is the first player to join", () => {
    expect(room("ada").state.lobby.hostId).toBe("ada");
    expect(room("ada", "bo", "cy").state.lobby.hostId).toBe("ada");
  });

  it("passes to the next player who joined when the host leaves", () => {
    const s = leaveSession(room("ada", "bo", "cy"), "ada");
    expect(s.state.lobby.hostId).toBe("bo");
    expect(leaveSession(s, "bo").state.lobby.hostId).toBe("cy");
  });

  it("does not change when someone else leaves", () => {
    expect(leaveSession(room("ada", "bo", "cy"), "bo").state.lobby.hostId).toBe("ada");
  });

  it("is nobody once the room is empty, and the next joiner takes over", () => {
    const empty = leaveSession(room("ada"), "ada");
    expect(empty.state.lobby.hostId).toBeNull();
    expect(ok(joinSession(empty, "bo", "Bo")).state.lobby.hostId).toBe("bo");
  });

  it("keeps their role through a dropped connection", () => {
    const dropped = disconnectFromSession(room("ada", "bo"), "ada");
    expect(dropped.state.lobby.hostId).toBe("ada");
    expect(ok(joinSession(dropped, "ada", "Ada")).state.lobby.hostId).toBe("ada");
  });
});

describe("crew size", () => {
  it("can be changed by the host to 2, 3 or 4", () => {
    for (const size of [2, 3, 4]) expect(ok(configureRoom(room("ada"), "ada", size)).state.lobby.crewSize).toBe(size);
  });

  it("cannot be changed by anyone else", () => {
    expect(refused(configureRoom(room("ada", "bo"), "bo", 2))).toBe("notHost");
    expect(refused(configureRoom(room("ada"), "stranger", 2))).toBe("notHost");
  });

  it("must be a whole number from 2 to 4", () => {
    for (const size of [0, 1, 5, 2.5, Number.NaN]) expect(refused(configureRoom(room("ada"), "ada", size))).toBe("invalidMessage");
  });

  it("never drops below the players already in the room", () => {
    const three = room("ada", "bo", "cy");
    expect(refused(configureRoom(three, "ada", 2))).toBe("invalidMessage");
    expect(ok(configureRoom(three, "ada", 3)).state.lobby.crewSize).toBe(3);
  });

  it("can only be changed in the lobby", () => {
    const playing = ok(departSession(ok(configureRoom(room("ada", "bo"), "ada", 2)), "ada"));
    expect(refused(configureRoom(playing, "ada", 3))).toBe("gameInProgress");
  });
});

describe("full room", () => {
  it("refuses a player who would go over the crew size", () => {
    const pair = ok(configureRoom(room("ada", "bo"), "ada", 2));
    expect(isRoomFull(pair.state)).toBe(true);
    expect(refused(joinSession(pair, "cy", "Cy"))).toBe("roomFull");
  });

  it("lets them in once the host makes room", () => {
    const pair = ok(configureRoom(room("ada", "bo"), "ada", 2));
    const bigger = ok(configureRoom(pair, "ada", 3));
    expect(ok(joinSession(bigger, "cy", "Cy")).state.players.cy).toBeDefined();
  });

  it("still lets a player who is already in come back", () => {
    const pair = disconnectFromSession(ok(configureRoom(room("ada", "bo"), "ada", 2)), "bo");
    expect(ok(joinSession(pair, "bo", "Bo")).state.players.bo?.connected).toBe(true);
  });
});

describe("departing", () => {
  it("starts the run when the host departs with a complete crew", () => {
    const ready = ok(configureRoom(room("ada", "bo", "cy"), "ada", 3));
    expect(canDepart(ready.state, "ada")).toBe(true);
    expect(ok(departSession(ready, "ada")).state.phase).toBe("playing");
  });

  it("is refused for anyone but the host", () => {
    const ready = ok(configureRoom(room("ada", "bo"), "ada", 2));
    expect(canDepart(ready.state, "bo")).toBe(false);
    expect(refused(departSession(ready, "bo"))).toBe("notHost");
  });

  it("waits until the crew is complete", () => {
    const waiting = ok(configureRoom(room("ada", "bo"), "ada", 3));
    expect(canDepart(waiting.state, "ada")).toBe(false);
    expect(refused(departSession(waiting, "ada"))).toBe("notEnoughPlayers");
  });

  it("does not count a player whose connection dropped", () => {
    const dropped = disconnectFromSession(ok(configureRoom(room("ada", "bo"), "ada", 2)), "bo");
    expect(refused(departSession(dropped, "ada"))).toBe("notEnoughPlayers");
  });

  it("is refused once the run is going", () => {
    const playing = ok(departSession(ok(configureRoom(room("ada", "bo"), "ada", 2)), "ada"));
    expect(canDepart(playing.state, "ada")).toBe(false);
    expect(refused(departSession(playing, "ada"))).toBe("gameInProgress");
  });

  it("keeps the host and crew size for the next run", () => {
    const playing = ok(departSession(ok(configureRoom(room("ada", "bo"), "ada", 2)), "ada"));
    expect(playing.state.lobby).toEqual({ hostId: "ada", crewSize: 2 });
  });
});
