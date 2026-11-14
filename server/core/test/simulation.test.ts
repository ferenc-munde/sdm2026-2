import { describe, expect, it } from "vitest";
import { type } from "@colyseus/schema";
import { z } from "zod";
import { ReplaySchema } from "../src/shared";
import { BaseState, RoomSettingsSchema, type GameDefinition, type RoomSettings } from "../src/sim";
import { JoinRejectedError, MAX_RECORDED_EVENTS, Simulation, hashState, runReplay } from "../src/server";

class DiceState extends BaseState {
  @type("number") total = 0;
  @type("number") rolls = 0;
  @type("string") names = "";
}

const InputSchema = z.object({ add: z.number().int().min(0).max(10) });
const JoinSchema = z.object({ name: z.string().min(1, "a name is required").max(12) });

const dice: GameDefinition<DiceState, RoomSettings, z.infer<typeof InputSchema>, z.infer<typeof JoinSchema>> = {
  id: "dice",
  configSchema: RoomSettingsSchema,
  inputSchema: InputSchema,
  joinOptionsSchema: JoinSchema,
  createState: () => new DiceState(),
  init(state, ctx) {
    state.total = ctx.random.int(0, 1000);
  },
  join(state, _playerId, _ctx, options) {
    state.names = state.names ? `${state.names},${options.name}` : options.name;
  },
  leave() {},
  step(state, inputs, ctx) {
    for (const { input } of inputs) state.total += input.add;
    state.rolls += ctx.random.int(1, 6);
  },
  commands: {
    pause: (state) => {
      state.paused = true;
    },
    resume: (state) => {
      state.paused = false;
    },
  },
};

const config = { tickRate: 20, patchRate: 20, maxPlayers: 4, reconnectSeconds: 5 };

function newSimulation(seed = 42) {
  const sim = new Simulation(dice, config, seed);
  sim.state.code = "ABCD";
  sim.start();
  return sim;
}

describe("Simulation", () => {
  it("rejects join options that fail the game's schema and leaves no seat behind", () => {
    const sim = newSimulation();
    expect(() => sim.join("p1", { name: "" })).toThrow(JoinRejectedError);
    expect(sim.state.seats.size).toBe(0);
    expect(sim.toReplay().events).toEqual([]);
  });

  it("ignores repeated sequence numbers and rejects invalid inputs without recording them", () => {
    const sim = newSimulation();
    sim.join("p1", { name: "Ann" });
    expect(sim.input("p1", 1, { add: 3 })).toBe("accepted");
    expect(sim.input("p1", 1, { add: 3 })).toBe("stale");
    expect(sim.input("p1", 2, { add: 99 })).toBe("invalid");
    expect(sim.input("ghost", 1, { add: 1 })).toBe("invalid");
    expect(sim.toReplay().events.filter((event) => event.type === "input")).toHaveLength(1);
  });

  it("does not step while paused", () => {
    const sim = newSimulation();
    expect(sim.step()).toBe(true);
    sim.debug("p1", "pause");
    expect(sim.step()).toBe(false);
    expect(sim.tick).toBe(1);
  });

  it("records a replay that parses and re-runs to the same state hash", () => {
    const sim = newSimulation(7);
    sim.join("p1", { name: "Ann" });
    sim.join("p2", { name: "Bob" });
    sim.input("p1", 1, { add: 4 });
    for (let i = 0; i < 5; i++) sim.step();
    sim.input("p2", 1, { add: 9 });
    sim.drop("p2");
    sim.step();
    sim.reconnect("p2");
    sim.input("p1", 2, { add: 1 });
    sim.debug("p1", "pause");
    sim.input("p2", 2, { add: 2 });
    sim.debug("p1", "resume");
    for (let i = 0; i < 3; i++) sim.step();
    sim.leave("p1");
    sim.step();

    const replay = sim.toReplay();
    expect(ReplaySchema.parse(JSON.parse(JSON.stringify(replay)))).toEqual(replay);
    expect(replay.ticks).toBe(10);

    const result = runReplay(dice, replay);
    expect(result.matches).toBe(true);
    expect(result.hash).toBe(sim.hash());
    expect(result.state.total).toBe(sim.state.total);
    expect(result.state.names).toBe("Ann,Bob");
  });

  it("gives a different hash when the replay is changed", () => {
    const sim = newSimulation(7);
    sim.join("p1", { name: "Ann" });
    sim.input("p1", 1, { add: 4 });
    sim.step();
    const replay = sim.toReplay();
    const tampered = { ...replay, events: replay.events.map((event) => (event.type === "input" ? { ...event, input: { add: 5 } } : event)) };
    expect(runReplay(dice, tampered).matches).toBe(false);
  });

  it("leaves the room code out of the state hash", () => {
    const a = newSimulation();
    const b = newSimulation();
    b.state.code = "WXYZ";
    expect(hashState(a.state)).toBe(hashState(b.state));
  });

  it("marks the replay truncated at the recording limit and refuses to re-run it", () => {
    const sim = newSimulation();
    sim.join("p1", { name: "Ann" });
    for (let seq = 1; seq <= MAX_RECORDED_EVENTS + 5; seq++) sim.input("p1", seq, { add: 0 });
    const replay = sim.toReplay();
    expect(replay.events).toHaveLength(MAX_RECORDED_EVENTS);
    expect(replay.truncated).toBe(true);
    expect(() => runReplay(dice, replay)).toThrow(/truncated/);
  });

  it("refuses a replay of another game", () => {
    const replay = newSimulation().toReplay();
    expect(() => runReplay({ ...dice, id: "other" }, replay)).toThrow(/other/);
  });
});
