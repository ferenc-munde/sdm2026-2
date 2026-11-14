import { describe, expect, it } from "vitest";
import { makeState } from "../shared/run/testState.ts";
import type { GameState } from "../shared/types.ts";
import { waitingHint, waitingView } from "./waitingRoomModel.ts";

const lobby = (playerIds: string[], crewSize?: number): GameState => {
  const state = makeState({ phase: "lobby" }, playerIds);
  return crewSize === undefined ? state : { ...state, lobby: { ...state.lobby, crewSize } };
};

describe("waitingView", () => {
  it("lists the crew with the host marked", () => {
    const view = waitingView(lobby(["a", "b", "c"], 3), "a");
    expect(view.crew.map((member) => member.name)).toEqual(["a", "b", "c"]);
    expect(view.crew.map((member) => member.host)).toEqual([true, false, false]);
    expect(view.isHost).toBe(true);
    expect(view.seats).toBe(3);
    expect(view.connected).toBe(3);
  });

  it("counts only connected players as present", () => {
    const base = lobby(["a", "b", "c"], 3);
    const state: GameState = {
      ...base,
      players: { ...base.players, b: { ...base.players.b!, connected: false } },
    };
    const view = waitingView(state, "a");
    expect(view.connected).toBe(2);
    expect(view.seats).toBe(3);
    expect(view.complete).toBe(false);
  });

  it("is complete when the connected players match the crew size", () => {
    expect(waitingView(lobby(["a", "b"], 2), "a").complete).toBe(true);
    expect(waitingView(lobby(["a", "b"], 3), "a").complete).toBe(false);
  });

  it("lets only the host depart, and only with a complete crew", () => {
    expect(waitingView(lobby(["a", "b"], 2), "a").canDepart).toBe(true);
    expect(waitingView(lobby(["a", "b"], 2), "b").canDepart).toBe(false);

    const incomplete = lobby(["a", "b"], 3);
    expect(waitingView(incomplete, "a").canDepart).toBe(false);

    const notLobby = { ...lobby(["a", "b"], 2), phase: "playing" as const };
    expect(waitingView(notLobby, "a").canDepart).toBe(false);
  });

  it("shows the departure countdown to everyone and disables the button (#385)", () => {
    const base = lobby(["a", "b"], 2);
    const state: GameState = { ...base, lobby: { ...base.lobby, departingIn: 3.2 } };

    const host = waitingView(state, "a");
    expect(host.departIn).toBeCloseTo(3.2);
    expect(host.canDepart).toBe(false);
    expect(waitingHint(host)).toBe("Departing in 4…");

    const crew = waitingView(state, "b");
    expect(crew.departIn).toBeCloseTo(3.2);
    expect(crew.canDepart).toBe(false);
  });

  it("offers 2-4 and disables sizes below the players in the room", () => {
    const three = waitingView(lobby(["a", "b", "c"], 3), "a");
    expect(three.sizeOptions).toEqual([
      { size: 2, enabled: false },
      { size: 3, enabled: true },
      { size: 4, enabled: true },
    ]);

    const four = waitingView(lobby(["a", "b", "c", "d"], 4), "a");
    expect(four.sizeOptions.map((option) => option.enabled)).toEqual([false, false, true]);
  });
});

describe("waitingHint", () => {
  it("says how many players are missing", () => {
    expect(waitingHint(waitingView(lobby(["a"], 3), "a"))).toBe("Waiting for 2 more players.");
    expect(waitingHint(waitingView(lobby(["a", "b"], 3), "a"))).toBe("Waiting for 1 more player.");
  });

  it("says what the host can do when the crew is complete", () => {
    expect(waitingHint(waitingView(lobby(["a", "b"], 2), "a"))).toBe(
      "Crew complete. Walk to the departure lever or press Depart.",
    );
    expect(waitingHint(waitingView(lobby(["a", "b"], 2), "b"))).toBe("Waiting for the host to depart.");
  });
});
