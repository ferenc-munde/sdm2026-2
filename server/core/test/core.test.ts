import { describe, expect, it } from "vitest";
import { InputEnvelopeSchema, SeededRandom, isDebugEnabled, parseAppEnv } from "../src/shared";
import { BaseState, RoomSettingsSchema, Seat } from "../src/sim";

describe("SeededRandom", () => {
  it("gives the same sequence for the same seed", () => {
    const a = new SeededRandom(42);
    const b = new SeededRandom(42);
    expect(Array.from({ length: 5 }, () => a.next())).toEqual(Array.from({ length: 5 }, () => b.next()));
  });

  it("restores a saved state", () => {
    const a = new SeededRandom(7);
    a.next();
    const saved = a.getState();
    const expected = a.next();
    a.setState(saved);
    expect(a.next()).toBe(expected);
  });

  it("keeps int() inside the range", () => {
    const r = new SeededRandom(1);
    for (let i = 0; i < 200; i++) {
      const n = r.int(3, 5);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(5);
    }
  });
});

describe("env", () => {
  it("falls back to local and disables debug only in production", () => {
    expect(parseAppEnv("nonsense")).toBe("local");
    expect(isDebugEnabled("development")).toBe(true);
    expect(isDebugEnabled("production")).toBe(false);
  });
});

describe("messages", () => {
  it("rejects an input envelope without a valid seq", () => {
    expect(InputEnvelopeSchema.safeParse({ seq: -1, input: {} }).success).toBe(false);
    expect(InputEnvelopeSchema.safeParse({ seq: 0, input: { x: 1 } }).success).toBe(true);
  });
});

describe("sim", () => {
  it("applies room setting defaults", () => {
    expect(RoomSettingsSchema.parse({})).toEqual({
      tickRate: 20,
      patchRate: 20,
      maxPlayers: 4,
      reconnectSeconds: 20,
    });
  });

  it("creates a state with seats", () => {
    const state = new BaseState();
    const seat = new Seat();
    seat.playerId = "p1";
    state.seats.set("p1", seat);
    expect(state.seats.get("p1")?.connected).toBe(true);
  });
});

describe("client helper", () => {
  it("derives the server address from the page, or takes the configured one", async () => {
    const { serverAddress } = await import("../src/client");
    expect(serverAddress({ protocol: "http:", hostname: "localhost" })).toEqual({
      http: "http://localhost:2567",
      ws: "ws://localhost:2567",
    });
    expect(serverAddress({ protocol: "http:", hostname: "localhost" }, " https://games.example/team-2/ ")).toEqual({
      http: "https://games.example/team-2",
      ws: "wss://games.example/team-2",
    });
  });

  it("uses port 2567 next to the page on the Vite dev server", async () => {
    const { serverAddress } = await import("../src/client");
    const page = { protocol: "http:", hostname: "192.168.1.20", host: "192.168.1.20:5173", pathname: "/" };
    expect(serverAddress(page, undefined, true)).toEqual({ http: "http://192.168.1.20:2567", ws: "ws://192.168.1.20:2567" });
  });

  it("uses the page's own origin and folder when the game server served the page", async () => {
    const { serverAddress } = await import("../src/client");
    // At the root of a domain, as on Railway.
    expect(serverAddress({ protocol: "https:", hostname: "game.example", host: "game.example", pathname: "/" }, undefined, false)).toEqual({
      http: "https://game.example",
      ws: "wss://game.example",
    });
    // Under a path, as behind the gateway; the file name is dropped, the folder is kept.
    expect(
      serverAddress({ protocol: "https:", hostname: "games.example", host: "games.example", pathname: "/team-2/index.html" }, "", false),
    ).toEqual({ http: "https://games.example/team-2", ws: "wss://games.example/team-2" });
    // A port in the address is kept; an invite link's query does not matter because it is not in `pathname`.
    expect(serverAddress({ protocol: "http:", hostname: "localhost", host: "localhost:2567", pathname: "/team-1/" }, undefined, false).http).toBe(
      "http://localhost:2567/team-1",
    );
    // Callers that only know protocol and hostname still get a usable address.
    expect(serverAddress({ protocol: "https:", hostname: "game.example" }, undefined, false).http).toBe("https://game.example");
  });

  it("lets a configured address win in every mode", async () => {
    const { serverAddress } = await import("../src/client");
    const page = { protocol: "https:", hostname: "game.example", host: "game.example", pathname: "/" };
    for (const devServer of [true, false]) {
      expect(serverAddress(page, "https://rooms.example/", devServer).http).toBe("https://rooms.example");
    }
  });

  it("numbers input envelopes from 1 and the host's envelope schema accepts them", async () => {
    const { createInputEnvelopes } = await import("../src/client");
    const envelope = createInputEnvelopes<{ move: string }>();
    expect(envelope({ move: "left" })).toEqual({ seq: 1, input: { move: "left" } });
    expect(envelope({ move: "up" }).seq).toBe(2);
    expect(InputEnvelopeSchema.safeParse(envelope({ move: "down" })).success).toBe(true);
  });
});
