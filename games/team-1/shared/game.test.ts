
// Unit tests for the rules: no server, no clock. Each `step` call is one tick.
import { describe, expect, it } from "vitest";
import { SeededRandom } from "@sdm/core/shared";
import type { GameContext } from "@sdm/core/sim";
import rawConfig from "../config/game.json";
import {
  ConfigSchema,
  InputSchema,
  JoinOptionsSchema,
  PLAYER_COLORS,
  lastTrain,
  type TrainConfig,
  type TrainInput,
  type TrainState,
} from "./game";
import { SECTIONS, TASK_CATALOGUE, sectionAt } from "./train-layout";

const config = ConfigSchema.parse(rawConfig);

function setup(overrides: Partial<TrainConfig> = {}, seed = 1) {
  const ctx: GameContext<TrainConfig> = {
    random: new SeededRandom(seed),
    config: { ...config, ...overrides },
  };
  const state: TrainState = lastTrain.createState(ctx.config);
  lastTrain.init(state, ctx);
  const join = (id: string, name = id) => lastTrain.join(state, id, ctx, { name });
  const step = (...inputs: Array<[string, TrainInput]>) =>
    lastTrain.step(state, inputs.map(([playerId, input]) => ({ playerId, input })), ctx);
  const player = (id: string) => {
    const found = state.players.get(id);
    if (!found) throw new Error(`no player ${id}`);
    return found;
  };
  return { ctx, state, join, step, player };
}

describe("config and schemas", () => {
  it("accepts config/game.json", () => {
    expect(config.maxPlayers).toBe(4);
    expect(config.roundSeconds).toBeGreaterThan(0);
  });

  it("rejects a config without the tuning values", () => {
    expect(ConfigSchema.safeParse({ tickRate: 20 }).success).toBe(false);
    expect(ConfigSchema.safeParse({ ...rawConfig, taskCount: TASK_CATALOGUE.length + 1 }).success).toBe(false);
  });

  it("validates join names like the lobby does", () => {
    expect(JoinOptionsSchema.parse({ name: "  Ada  " })).toEqual({ name: "Ada" });
    expect(JoinOptionsSchema.safeParse({ name: "   " }).success).toBe(false);
    expect(JoinOptionsSchema.safeParse({ name: "x".repeat(19) }).success).toBe(false);
    expect(JoinOptionsSchema.safeParse({}).success).toBe(false);
  });

  it("validates inputs", () => {
    expect(InputSchema.safeParse({ type: "move", x: 1, z: -1 }).success).toBe(true);
    expect(InputSchema.safeParse({ type: "move", x: 2, z: 0 }).success).toBe(false);
    expect(InputSchema.safeParse({ type: "move", x: Number.NaN, z: 0 }).success).toBe(false);
    expect(InputSchema.safeParse({ type: "start" }).success).toBe(true);
    expect(InputSchema.safeParse({ type: "repair" }).success).toBe(true);
    expect(InputSchema.safeParse({
      type: "brake-calibrate",
      action: "apply-pressure",
    }).success).toBe(true);
    expect(InputSchema.safeParse({
      type: "brake-calibrate",
      action: "invalid-action",
    }).success).toBe(false);
    expect(InputSchema.safeParse({ type: "fly" }).success).toBe(false);
  });
});

describe("train layout", () => {
  it("maps normalised x positions to the five sections", () => {
    expect(sectionAt(0)).toBe("engine");
    expect(sectionAt(0.25)).toBe("electrical");
    expect(sectionAt(0.5)).toBe("control");
    expect(sectionAt(0.75)).toBe("passenger");
    expect(sectionAt(1)).toBe("rear");
    expect(sectionAt(7)).toBe("rear");
    expect(SECTIONS).toHaveLength(5);
  });
});

describe("lobby", () => {
  it("deals all five configured repairs, including the control cabin and passenger carriage", () => {
    const { state } = setup();
    expect(config.taskCount).toBe(5);
    expect(state.tasks).toHaveLength(5);
    expect(new Set(state.tasks.map((task) => task.id))).toEqual(
      new Set(TASK_CATALOGUE.map((task) => task.id)),
    );
    expect(state.tasks.find((task) => task.id === "instruments")?.section).toBe("control");
    expect(state.tasks.find((task) => task.id === "passenger-lights")?.section).toBe("passenger");
  });

  it("starts in the lobby with a full clock and the configured number of tasks", () => {
    const { state } = setup({ taskCount: 2 });
    expect(state.phase).toBe("lobby");
    expect(state.secondsRemaining).toBe(config.roundSeconds);
    expect(state.trainCondition).toBe(100);
    expect(state.tasks).toHaveLength(2);
    expect(new Set(state.tasks.map((task) => task.id)).size).toBe(2);
  });

  it("gives players a seat, a colour by seat order, and reuses a freed seat", () => {
    const { state, join, player, ctx } = setup();
    join("a", "Ada");
    join("b", "Bo");
    join("c", "Cy");
    expect([player("a").color, player("b").color, player("c").color]).toEqual(PLAYER_COLORS.slice(0, 3));
    expect(player("a").name).toBe("Ada");
    expect(player("a").x).not.toBe(player("b").x);

    lastTrain.leave(state, "b", ctx);
    expect(state.players.has("b")).toBe(false);
    join("d", "Di");
    expect(player("d").seat).toBe(1);
    expect(player("d").color).toBe(PLAYER_COLORS[1]);
  });

  it("does not run the clock or move anyone before the start", () => {
    const { state, join, step, player } = setup();
    join("a");
    const before = player("a").x;
    step(["a", { type: "move", x: 1, z: 0 }]);
    step();
    expect(player("a").x).toBe(before);
    expect(state.secondsRemaining).toBe(config.roundSeconds);
    expect(state.runTicks).toBe(0);
  });
});

describe("a run", () => {
  it("starts on `start` and counts down one second per tickRate ticks", () => {
    const { state, join, step } = setup();
    join("a");
    step(["a", { type: "start" }]);
    expect(state.phase).toBe("playing");
    for (let tick = 1; tick < config.tickRate; tick += 1) step();
    expect(state.secondsRemaining).toBe(config.roundSeconds - 1);
    step();
    expect(state.secondsRemaining).toBe(config.roundSeconds - 1);
    for (let tick = 0; tick < config.tickRate; tick += 1) step();
    expect(state.secondsRemaining).toBe(config.roundSeconds - 2);
  });

  it("moves a player at the configured speed until told to stop", () => {
    const { join, step, player } = setup();
    join("a");
    step(["a", { type: "start" }]);
    const start = player("a").x;
    step(["a", { type: "move", x: 1, z: 0 }]);
    for (let tick = 1; tick < config.tickRate; tick += 1) step();
    expect(player("a").x - start).toBeCloseTo(config.playerSpeed / 23, 5);
    expect(player("a").z).toBe(0.5);

    step(["a", { type: "move", x: 0, z: 0 }]);
    const stopped = player("a").x;
    step();
    expect(player("a").x).toBe(stopped);
  });

  it("keeps positions inside the train and caps diagonal speed", () => {
    const { join, step, player } = setup({ playerSpeed: 50 });
    join("a");
    step(["a", { type: "start" }]);
    step(["a", { type: "move", x: -1, z: -1 }]);
    expect(Math.hypot(player("a").moveX, player("a").moveZ)).toBeCloseTo(1, 10);
    for (let tick = 0; tick < 200; tick += 1) step();
    expect(player("a").x).toBe(0);
    expect(player("a").z).toBe(0);
    step(["a", { type: "move", x: 1, z: 1 }]);
    for (let tick = 0; tick < 200; tick += 1) step();
    expect(player("a").x).toBe(1);
    expect(player("a").z).toBe(1);
  });

  it("stops a disconnected player and marks the reconnect", () => {
    const { state, ctx, join, step, player } = setup();
    join("a");
    step(["a", { type: "start" }]);
    step(["a", { type: "move", x: 1, z: 0 }]);
    lastTrain.disconnect?.(state, "a", ctx);
    const parked = player("a").x;
    step();
    expect(player("a").connected).toBe(false);
    expect(player("a").x).toBe(parked);
    lastTrain.reconnect?.(state, "a", ctx);
    expect(player("a").connected).toBe(true);
  });

  it("repairs only the task in the section the player stands in, one step per tick", () => {
    const { state, join, step, player } = setup({
      taskCount: TASK_CATALOGUE.length,
      repairStep: 25,
    });
    join("a");
    step(["a", { type: "start" }]);
    const wiring = state.tasks.find((task) => task.id === "wiring");
    const boiler = state.tasks.find((task) => task.id === "boiler");
    if (!wiring || !boiler) throw new Error("a task is missing");

    expect(sectionAt(player("a").x)).toBe("electrical");
    step(["a", { type: "repair" }]);
    expect(wiring.progress).toBe(25);
    expect(boiler.progress).toBe(0);

    player("a").x = 0.05;
    expect(sectionAt(player("a").x)).toBe("engine");
    step(["a", { type: "repair" }], ["a", { type: "repair" }]);
    expect(boiler.progress).toBe(25);
    step(["a", { type: "repair" }]);
    expect(boiler.progress).toBe(50);
    expect(wiring.progress).toBe(25);

    player("a").x = 0.5;
    step(["a", { type: "repair" }]);
    expect(state.tasks.find((task) => task.id === "instruments")?.progress).toBe(25);
    player("a").x = 0.75;
    step(["a", { type: "repair" }]);
    expect(state.tasks.find((task) => task.id === "passenger-lights")?.progress).toBe(25);
  });

  it("requires the correct brake calibration sequence", () => {
    const { state, join, step, player } = setup({
      taskCount: TASK_CATALOGUE.length,
    });
    join("a");
    step(["a", { type: "start" }]);

    const brakes = state.tasks.find((task) => task.id === "brakes");
    if (!brakes) throw new Error("brakes task is missing");

    player("a").x = 0.95;
    expect(sectionAt(player("a").x)).toBe("rear");

    step(["a", { type: "brake-calibrate", action: "apply-pressure" }]);
    expect(brakes.calibrationStep).toBe(1);
    expect(brakes.progress).toBe(33);

    step(["a", { type: "brake-calibrate", action: "hold-pressure" }]);
    expect(brakes.calibrationStep).toBe(2);
    expect(brakes.progress).toBe(67);

    step(["a", { type: "brake-calibrate", action: "release-pressure" }]);
    expect(brakes.calibrationStep).toBe(3);
    expect(brakes.progress).toBe(100);

    // The other four tasks are still open, so the run must continue.
    expect(state.phase).toBe("playing");
  });

  it("wins a one-task run when the selected task is completed brake calibration", () => {
    // `start` deals a fresh task set, so find a deterministic seed for the second deal.
    const seed = Array.from({ length: 256 }, (_, index) => index + 1).find((candidate) => {
      const trial = setup({ taskCount: 1 }, candidate);
      trial.join("a");
      trial.step(["a", { type: "start" }]);
      return trial.state.tasks.at(0)?.id === "brakes";
    });
    if (seed === undefined) throw new Error("no seed selected the brakes task");

    const { state, join, step, player } = setup({ taskCount: 1 }, seed);
    join("a");
    step(["a", { type: "start" }]);
    const brakes = state.tasks.at(0);
    if (!brakes) throw new Error("no task was dealt");
    expect(brakes.id).toBe("brakes");

    player("a").x = 0.95;
    step(["a", { type: "brake-calibrate", action: "apply-pressure" }]);
    expect(brakes.progress).toBe(33);
    expect(state.phase).toBe("playing");

    step(["a", { type: "brake-calibrate", action: "hold-pressure" }]);
    expect(brakes.progress).toBe(67);
    expect(state.phase).toBe("playing");

    step(["a", { type: "brake-calibrate", action: "release-pressure" }]);
    expect(brakes.progress).toBe(100);
    expect(state.phase).toBe("victory");
  });

  it("resets brake calibration after an incorrect action", () => {
    const { state, join, step, player } = setup({
      taskCount: TASK_CATALOGUE.length,
    });
    join("a");
    step(["a", { type: "start" }]);

    const brakes = state.tasks.find((task) => task.id === "brakes");
    if (!brakes) throw new Error("brakes task is missing");

    player("a").x = 0.95;
    step(["a", { type: "brake-calibrate", action: "apply-pressure" }]);
    expect(brakes.progress).toBe(33);

    step(["a", { type: "brake-calibrate", action: "release-pressure" }]);
    expect(brakes.calibrationStep).toBe(0);
    expect(brakes.progress).toBe(0);
    expect(state.phase).toBe("playing");
  });

  it("does not allow generic repair to bypass brake calibration", () => {
    const { state, join, step, player } = setup({
      taskCount: TASK_CATALOGUE.length,
      repairStep: 100,
    });
    join("a");
    step(["a", { type: "start" }]);

    const brakes = state.tasks.find((task) => task.id === "brakes");
    if (!brakes) throw new Error("brakes task is missing");

    player("a").x = 0.95;
    step(["a", { type: "repair" }]);

    expect(brakes.progress).toBe(0);
    expect(brakes.calibrationStep).toBe(0);
    expect(state.phase).toBe("playing");
  });

  it("does not allow brake calibration outside the rear carriage", () => {
    const { state, join, step, player } = setup({
      taskCount: TASK_CATALOGUE.length,
    });
    join("a");
    step(["a", { type: "start" }]);

    const brakes = state.tasks.find((task) => task.id === "brakes");
    if (!brakes) throw new Error("brakes task is missing");

    player("a").x = 0.5;
    step(["a", { type: "brake-calibrate", action: "apply-pressure" }]);

    expect(brakes.progress).toBe(0);
    expect(brakes.calibrationStep).toBe(0);
  });

  it("ends in victory when every task is complete", () => {
    const { state, join, step, player } = setup({
      taskCount: 1,
      repairStep: 50,
    });
    join("a");
    step(["a", { type: "start" }]);
    const task = state.tasks.at(0);
    if (!task) throw new Error("no task was dealt");
    const sectionIndex = SECTIONS.findIndex((section) => section === task.section);
    player("a").x = (sectionIndex + 0.5) / SECTIONS.length;
    expect(sectionAt(player("a").x)).toBe(task.section);
    step(["a", { type: "repair" }]);
    expect(state.phase).toBe("playing");
    step(["a", { type: "repair" }]);
    expect(task.progress).toBe(100);
    expect(state.phase).toBe("victory");

    const ticks = state.runTicks;
    step();
    expect(state.runTicks).toBe(ticks);
  });

  it("ends in failure when the time runs out", () => {
    const { state, join, step } = setup({
      roundSeconds: 10,
      conditionDecayPerSecond: 0,
    });
    join("a");
    step(["a", { type: "start" }]);
    for (let tick = 1; tick < 10 * config.tickRate; tick += 1) step();
    expect(state.phase).toBe("failure");
    expect(state.secondsRemaining).toBe(0);
    expect(state.trainCondition).toBe(100);
  });

  it("ends in failure when the train condition reaches zero", () => {
    const { state, join, step } = setup({
      conditionDecayPerSecond: 100,
    });
    join("a");
    step(["a", { type: "start" }]);
    for (let tick = 0; tick < config.tickRate; tick += 1) step();
    expect(state.trainCondition).toBe(0);
    expect(state.phase).toBe("failure");
    expect(state.secondsRemaining).toBeGreaterThan(0);
  });

  it("starts a fresh run after the previous one ended", () => {
    const { state, join, step, player } = setup({
      conditionDecayPerSecond: 100,
    });
    join("a");
    step(["a", { type: "start" }]);
    step(["a", { type: "move", x: 1, z: 0 }]);
    for (let tick = 0; tick < config.tickRate; tick += 1) step();
    expect(state.phase).toBe("failure");

    step(["a", { type: "start" }]);
    expect(state.phase).toBe("playing");
    expect(state.runTicks).toBe(1);
    expect(state.trainCondition).toBeGreaterThan(90);
    expect(player("a").x).toBeCloseTo(0.18, 10);
    expect(player("a").moveX).toBe(0);
    expect(state.tasks.every((task) => task.progress === 0)).toBe(true);
  });

  it("ignores `start` while a run is under way", () => {
    const { state, join, step } = setup();
    join("a");
    step(["a", { type: "start" }]);
    for (let tick = 0; tick < 50; tick += 1) step();
    step(["a", { type: "start" }]);
    expect(state.runTicks).toBe(52);
  });
});

describe("determinism", () => {
  it("gives the same state for the same seed and inputs", () => {
    const run = (seed: number) => {
      const { state, join, step } = setup({ taskCount: 2 }, seed);
      join("a");
      join("b");
      step(["a", { type: "start" }]);
      step(["a", { type: "move", x: 0.5, z: -1 }], ["b", { type: "repair" }]);
      for (let tick = 0; tick < 40; tick += 1) {
        step(["b", { type: "repair" }]);
      }
      return JSON.stringify(state.toJSON());
    };
    expect(run(7)).toBe(run(7));
  });
});

