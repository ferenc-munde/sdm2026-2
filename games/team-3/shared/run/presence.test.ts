import { describe, expect, it } from "vitest";
import type { GameState } from "../types.ts";
import {
  disconnectPlayer,
  dropHeldItem,
  isCrewGone,
  isRoomEmpty,
  reconnectPlayer,
  removePlayer,
} from "./presence.ts";
import { makeItem, makePlayer, makeState } from "./testState.ts";

/** p1 stands at (30, 12) holding the wrench; p2 holds nothing. */
function crew(): GameState {
  const base = makeState();
  return {
    ...base,
    players: {
      p1: makePlayer("p1", { position: { x: 30, y: 12 }, heldItem: "wrench-1" }),
      p2: makePlayer("p2"),
    },
    items: {
      "wrench-1": makeItem("wrench-1", "wrench", { heldBy: "p1", velocity: { x: 3, y: 0 } }),
      "coal-1": makeItem("coal-1", "coal", { position: { x: 5, y: 5 } }),
    },
  };
}

describe("dropping a held item", () => {
  it("puts the item on the floor where the player stands", () => {
    const after = dropHeldItem(crew(), "p1");
    expect(after.players.p1?.heldItem).toBeNull();
    expect(after.items["wrench-1"]).toMatchObject({ heldBy: null, position: { x: 30, y: 12 }, velocity: { x: 0, y: 0 } });
    expect(after.items["coal-1"]).toEqual(crew().items["coal-1"]);
  });

  it("does nothing for empty hands or an unknown player", () => {
    const state = crew();
    expect(dropHeldItem(state, "p2")).toBe(state);
    expect(dropHeldItem(state, "nobody")).toBe(state);
  });
});

describe("a player's connection drops", () => {
  it("keeps the seat, marks them disconnected and drops their item", () => {
    const after = disconnectPlayer(crew(), "p1");
    expect(Object.keys(after.players)).toEqual(["p1", "p2"]);
    expect(after.players.p1).toMatchObject({ connected: false, heldItem: null, position: { x: 30, y: 12 } });
    expect(after.items["wrench-1"]?.heldBy).toBeNull();
  });

  it("lets the rest of the crew keep playing", () => {
    const after = disconnectPlayer(crew(), "p1");
    expect(after.phase).toBe("playing");
    expect(after.players.p2?.connected).toBe(true);
    expect(isCrewGone(after)).toBe(false);
  });

  it("does nothing for an unknown or already disconnected player", () => {
    const state = crew();
    expect(disconnectPlayer(state, "nobody")).toBe(state);
    const once = disconnectPlayer(state, "p1");
    expect(disconnectPlayer(once, "p1")).toBe(once);
  });
});

describe("a player comes back", () => {
  it("gets the same seat and position back, with empty hands", () => {
    const back = reconnectPlayer(disconnectPlayer(crew(), "p1"), "p1");
    expect(back.players.p1).toMatchObject({ connected: true, heldItem: null, position: { x: 30, y: 12 }, name: "p1" });
  });

  it("does nothing for an unknown or still connected player", () => {
    const state = crew();
    expect(reconnectPlayer(state, "nobody")).toBe(state);
    expect(reconnectPlayer(state, "p2")).toBe(state);
  });
});

describe("a player leaves for good", () => {
  it("frees the seat and drops their item", () => {
    const after = removePlayer(crew(), "p1");
    expect(Object.keys(after.players)).toEqual(["p2"]);
    expect(after.items["wrench-1"]).toMatchObject({ heldBy: null, position: { x: 30, y: 12 } });
  });

  it("does nothing for an unknown player", () => {
    const state = crew();
    expect(removePlayer(state, "nobody")).toBe(state);
  });

  it("reports an empty room once everyone has left", () => {
    const one = removePlayer(crew(), "p1");
    expect(isRoomEmpty(one)).toBe(false);
    expect(isRoomEmpty(removePlayer(one, "p2"))).toBe(true);
  });

  it("reports the crew gone when nobody is connected", () => {
    const state = disconnectPlayer(disconnectPlayer(crew(), "p1"), "p2");
    expect(isCrewGone(state)).toBe(true);
    expect(isRoomEmpty(state)).toBe(false);
  });
});

describe("purity", () => {
  it("never changes the state it is given", () => {
    const state = crew();
    const snapshot = structuredClone(state);
    disconnectPlayer(state, "p1");
    removePlayer(state, "p1");
    dropHeldItem(state, "p1");
    expect(state).toEqual(snapshot);
  });
});
