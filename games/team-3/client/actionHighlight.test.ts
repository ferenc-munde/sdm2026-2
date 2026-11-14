import { describe, expect, it } from "vitest";
import { createTrainMap } from "../shared/map/map.ts";
import { createPlatformMap } from "../shared/map/platform.ts";
import { makePlayer, makeState } from "../shared/run/testState.ts";
import type { GameState } from "../shared/types.ts";
import { actionHighlight, HIGHLIGHT_COLORS, localActionHighlight } from "./actionHighlight.ts";

const player = { x: 5, y: 7 };
const station = { kind: "coalDispenser" as const, car: 0, position: { x: 100, y: 200 } };

describe("turning a target into a ring", () => {
  it("rings the station for taking or delivering coal", () => {
    expect(actionHighlight({ kind: "takeCoal", station }, player)).toEqual({
      position: { x: 100, y: 200 },
      tone: "station",
    });
    expect(actionHighlight({ kind: "deliverCoal", station }, player)?.tone).toBe("station");
  });

  it("rings a free item where it lies, and the lever where it stands", () => {
    expect(actionHighlight({ kind: "pickUp", itemId: "wrench", position: { x: 30, y: -40 } }, player)).toEqual({
      position: { x: 30, y: -40 },
      tone: "item",
    });
    expect(actionHighlight({ kind: "lever", position: { x: -10, y: 12 } }, player)).toEqual({
      position: { x: -10, y: 12 },
      tone: "lever",
    });
  });

  it("rings the player's feet when the action is dropping", () => {
    expect(actionHighlight({ kind: "drop", itemId: "coal" }, player)).toEqual({ position: { x: 5, y: 7 }, tone: "drop" });
  });

  it("is null when nothing is in reach, and copies positions instead of aliasing", () => {
    expect(actionHighlight(null, player)).toBeNull();
    const target = { kind: "pickUp" as const, itemId: "coal", position: { x: 1, y: 2 } };
    const highlight = actionHighlight(target, player)!;
    highlight.position.x = 99;
    expect(target.position.x).toBe(1);
  });

  it("has a colour for every tone", () => {
    expect(Object.keys(HIGHLIGHT_COLORS).sort()).toEqual(["drop", "item", "lever", "station"]);
    for (const colour of Object.values(HIGHLIGHT_COLORS)) expect(colour).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe("the local player's highlight", () => {
  const platform = createPlatformMap();
  const lever = platform.objects.departureLever;
  const world = { train: createTrainMap(), platform };
  const lobby = (hostId: string | null, crewSize: number): GameState => ({
    ...makeState({
      players: {
        p1: makePlayer("p1", { position: { x: lever.x - 20, y: lever.y } }),
        p2: makePlayer("p2"),
        p3: makePlayer("p3"),
      },
      items: {},
      phase: "lobby",
    }),
    lobby: { hostId, crewSize },
  });

  it("shows the lever for the host once the crew is complete", () => {
    expect(localActionHighlight(lobby("p1", 3), "p1", world)).toEqual({
      position: { ...lever },
      tone: "lever",
    });
  });

  it("does not promise the lever to a non-host or an incomplete crew", () => {
    expect(localActionHighlight(lobby("p2", 3), "p1", world)).toBeNull();
    expect(localActionHighlight(lobby("p1", 4), "p1", world)).toBeNull();
  });

  it("is null for a player that is not in the state", () => {
    expect(localActionHighlight(lobby("p1", 3), "gone", world)).toBeNull();
  });
});
