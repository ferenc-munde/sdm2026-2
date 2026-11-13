import { describe, expect, it } from "vitest";
import { createTrainMap } from "../map/map.ts";
import { createPlatformMap, platformSpawn } from "../map/platform.ts";
import { createPlatformLobby, platformLobbyView, stepPlatformLobby, usePlatformAction } from "./boarding.ts";
import { applyInput, configureRoom, createSession, joinSession, type GameSession, type SessionResult } from "./session.ts";

const map = createPlatformMap();
const train = createTrainMap();
const ok = (r: SessionResult): GameSession => { expect(r.ok).toBe(true); return r.session; };
const joined = (...ids: string[]): GameSession => ids.reduce(
  (s, id, seat) => ok(joinSession(s, id, id, platformSpawn(map, seat))), createSession("ROOM"),
);
const at = (s: GameSession, id: string, position: { x: number; y: number }): GameSession => ({
  ...s, state: { ...s.state, players: { ...s.state.players, [id]: { ...s.state.players[id]!, position } } },
});

describe("integrated platform lobby", () => {
  it("uses the real host and crew rules at the map lever", () => {
    let session = ok(configureRoom(joined("host", "crew"), "host", 3));
    let result = usePlatformAction(createPlatformLobby(at(session, "crew", map.objects.departureLever), map), "crew", map, train);
    expect(result).toMatchObject({ ok: false, message: "Only the host can depart" });
    result = usePlatformAction(createPlatformLobby(at(session, "host", map.objects.departureLever), map), "host", map, train);
    expect(result).toMatchObject({ ok: false, message: "Waiting for the crew" });
    session = ok(configureRoom(session, "host", 2));
    result = usePlatformAction(createPlatformLobby(at(session, "host", map.objects.departureLever), map), "host", map, train);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.platform.session.state.phase).toBe("playing");
  });

  it("keeps practice coal out of the real journey and inventory", () => {
    let lobby = createPlatformLobby(at(joined("host"), "host", map.objects.coalPile), map);
    let action = usePlatformAction(lobby, "host", map, train);
    expect(action.ok).toBe(true); if (!action.ok) return;
    lobby = { ...action.platform, session: at(action.platform.session, "host", map.objects.boiler) };
    action = usePlatformAction(lobby, "host", map, train);
    expect(action.ok).toBe(true); if (!action.ok) return;
    expect(action.platform.practice.boilerFuel).toBe(35);
    expect(action.platform.session.state.journey.fuel).toBe(100);
    expect(action.platform.session.state.items).toEqual({});
  });

  it("rejects actions away from platform objects", () => {
    const lobby = createPlatformLobby(joined("host"), map);
    expect(usePlatformAction(lobby, "host", map, train)).toMatchObject({
      ok: false, message: "Action unavailable",
    });
  });

  it("lets a player drop a carried practice item away from the objects", () => {
    let lobby = createPlatformLobby(at(joined("host"), "host", map.objects.wrench), map);
    const pickUp = usePlatformAction(lobby, "host", map, train);
    expect(pickUp.ok).toBe(true); if (!pickUp.ok) return;
    lobby = { ...pickUp.platform, session: at(pickUp.platform.session, "host", map.objects.breach) };
    const drop = usePlatformAction(lobby, "host", map, train);
    expect(drop.ok).toBe(true); if (!drop.ok) return;
    expect(drop.platform.practice.items["practice-wrench"]?.heldBy).toBeNull();
  });

  it("repairs with held input and respawns after five seconds", () => {
    let lobby = createPlatformLobby(at(joined("host"), "host", map.objects.wrench), map);
    const action = usePlatformAction(lobby, "host", map, train);
    expect(action.ok).toBe(true); if (!action.ok) return;
    lobby = { ...action.platform, session: at(action.platform.session, "host", map.objects.breach) };
    lobby = { ...lobby, session: ok(applyInput(lobby.session, "host", { direction: { dx: 0, dy: 0 }, interacting: true })) };
    lobby = stepPlatformLobby(lobby, 3, map);
    expect(lobby.practice.breach).toBeNull();
    expect(platformLobbyView(lobby, map).journey).toEqual(lobby.session.state.journey);
    lobby = stepPlatformLobby(lobby, 4.99, map);
    expect(lobby.practice.breach).toBeNull();
    lobby = stepPlatformLobby(lobby, 0.01, map);
    expect(lobby.practice.breach?.id).toBe("practice-breach");
  });
});
