
// The Last Train (Team 1): the rules, as a platform GameDefinition (issue #240).
// Browser-safe and deterministic: no Math.random, no wall-clock time, no node:* imports.
// Time advances only in fixed ticks; one tick is 1 / config.tickRate seconds.
import { ArraySchema, MapSchema, Schema, type } from "@colyseus/schema";
import { z } from "zod";
import { BaseState, RoomSettingsSchema, type GameContext, type GameDefinition } from "@sdm/core/sim";
import { GAME_ID, MAX_NAME_LENGTH, PLAYER_COLORS, type Phase } from "./constants";
import { SECTION_TITLES, TASK_CATALOGUE, WALKABLE, sectionAt, type TaskDefinition } from "./train-layout";

export { GAME_ID, MAX_NAME_LENGTH, PLAYER_COLORS, type Phase };

const BRAKE_SEQUENCE = ["apply-pressure", "hold-pressure", "release-pressure"] as const;
type BrakeAction = (typeof BRAKE_SEQUENCE)[number];

export class PlayerState extends Schema {
  @type("string") name = "";
  @type("number") seat = 0;
  @type("string") color = "";
  @type("boolean") connected = true;
  @type("number") x = 0.5;
  @type("number") z = 0.5;
  @type("number") moveX = 0;
  @type("number") moveZ = 0;
}

export class TaskState extends Schema {
  @type("string") id = "";
  @type("string") label = "";
  @type("string") section = "";
  /** 0..100; the task is complete at 100. */
  @type("number") progress = 0;
  /** Number of correctly completed brake calibration actions (0..3). */
  @type("number") calibrationStep = 0;
}

export class TrainState extends BaseState {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type([TaskState]) tasks = new ArraySchema<TaskState>();
  @type("string") phase: Phase = "lobby";
  @type("number") runTicks = 0;
  @type("number") secondsRemaining = 0;
  @type("number") trainCondition = 100;
}

export const ConfigSchema = RoomSettingsSchema.extend({
  roundSeconds: z.number().int().min(10).max(3600),
  playerSpeed: z.number().positive().max(50),
  taskCount: z.number().int().min(1).max(TASK_CATALOGUE.length),
  repairStep: z.number().positive().max(100),
  conditionDecayPerSecond: z.number().min(0).max(100),
  repairConditionBonus: z.number().min(0).max(100),
});
export type TrainConfig = z.infer<typeof ConfigSchema>;

const axis = z.number().min(-1).max(1);

export const InputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("move"), x: axis, z: axis }),
  z.object({ type: z.literal("start") }),
  z.object({ type: z.literal("repair") }),
  z.object({
    type: z.literal("brake-calibrate"),
    action: z.enum(BRAKE_SEQUENCE),
  }),
]);
export type TrainInput = z.infer<typeof InputSchema>;

export const JoinOptionsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "a crew name is required")
    .max(MAX_NAME_LENGTH, `a crew name has at most ${MAX_NAME_LENGTH} characters`),
});
export type JoinOptions = z.infer<typeof JoinOptionsSchema>;

type Ctx = GameContext<TrainConfig>;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function spawnPoint(seat: number): { x: number; z: number } {
  return { x: 0.18 + (seat % 4) * 0.2, z: 0.5 };
}

export function repairableTask(state: TrainState, player: PlayerState): TaskState | undefined {
  const section = sectionAt(player.x);
  return state.tasks.find((task) => task.section === section && task.progress < 100);
}

function lowestFreeSeat(state: TrainState): number {
  const taken = new Set<number>();
  state.players.forEach((player) => taken.add(player.seat));
  let seat = 0;
  while (taken.has(seat)) seat += 1;
  return seat;
}

function dealTasks(state: TrainState, ctx: Ctx): void {
  const pool: TaskDefinition[] = [...TASK_CATALOGUE];
  state.tasks.clear();
  while (state.tasks.length < ctx.config.taskCount && pool.length > 0) {
    const [definition] = pool.splice(ctx.random.int(0, pool.length - 1), 1);
    if (!definition) break;
    const task = new TaskState();
    task.id = definition.id;
    task.label = `${definition.label} (${SECTION_TITLES[definition.section]})`;
    task.section = definition.section;
    state.tasks.push(task);
  }
}

function resetRun(state: TrainState, ctx: Ctx): void {
  state.runTicks = 0;
  state.secondsRemaining = ctx.config.roundSeconds;
  state.trainCondition = 100;
  dealTasks(state, ctx);
  state.players.forEach((player) => {
    const spawn = spawnPoint(player.seat);
    player.x = spawn.x;
    player.z = spawn.z;
    player.moveX = 0;
    player.moveZ = 0;
  });
}

function applyRepair(state: TrainState, player: PlayerState, ctx: Ctx): void {
  const task = repairableTask(state, player);
  // Brake calibration must use its dedicated sequence, never generic repair.
  if (!task || task.id === "brakes") return;

  task.progress = Math.min(100, task.progress + ctx.config.repairStep);
  if (task.progress >= 100) {
    state.trainCondition = Math.min(100, state.trainCondition + ctx.config.repairConditionBonus);
  }
}

function applyBrakeCalibration(state: TrainState, player: PlayerState, action: BrakeAction, ctx: Ctx): void {
  const task = repairableTask(state, player);
  if (!task || task.id !== "brakes") return;

  const expectedAction = BRAKE_SEQUENCE[task.calibrationStep];
  if (action !== expectedAction) {
    // An incorrect action resets the calibration; it cannot add progress.
    task.calibrationStep = 0;
    task.progress = 0;
    return;
  }

  task.calibrationStep += 1;
  task.progress = Math.round((task.calibrationStep / BRAKE_SEQUENCE.length) * 100);

  if (task.calibrationStep === BRAKE_SEQUENCE.length) {
    task.progress = 100;
    state.trainCondition = Math.min(100, state.trainCondition + ctx.config.repairConditionBonus);
  }
}

export const lastTrain: GameDefinition<TrainState, TrainConfig, TrainInput, JoinOptions> = {
  id: GAME_ID,
  configSchema: ConfigSchema,
  inputSchema: InputSchema,
  joinOptionsSchema: JoinOptionsSchema,

  createState: () => new TrainState(),

  init(state, ctx) {
    state.phase = "lobby";
    resetRun(state, ctx);
  },

  join(state, playerId, _ctx, options) {
    const player = new PlayerState();
    player.name = options.name;
    player.seat = lowestFreeSeat(state);
    player.color = PLAYER_COLORS[player.seat % PLAYER_COLORS.length] ?? PLAYER_COLORS[0];
    const spawn = spawnPoint(player.seat);
    player.x = spawn.x;
    player.z = spawn.z;
    state.players.set(playerId, player);
  },

  leave(state, playerId) {
    state.players.delete(playerId);
  },

  disconnect(state, playerId) {
    const player = state.players.get(playerId);
    if (!player) return;
    player.connected = false;
    player.moveX = 0;
    player.moveZ = 0;
  },

  reconnect(state, playerId) {
    const player = state.players.get(playerId);
    if (player) player.connected = true;
  },

  step(state, inputs, ctx) {
    const { config } = ctx;
    const secondsPerTick = 1 / config.tickRate;
    const taskActionThisTick = new Set<string>();

    for (const { playerId, input } of inputs) {
      const player = state.players.get(playerId);
      if (!player) continue;

      if (input.type === "move") {
        const length = Math.hypot(input.x, input.z);
        const scale = length > 1 ? 1 / length : 1;
        player.moveX = input.x * scale;
        player.moveZ = input.z * scale;
      } else if (input.type === "start") {
        if (state.phase !== "playing") {
          resetRun(state, ctx);
          state.phase = "playing";
        }
      } else if (state.phase === "playing" && !taskActionThisTick.has(playerId)) {
        taskActionThisTick.add(playerId);

        if (input.type === "repair") {
          applyRepair(state, player, ctx);
        } else if (input.type === "brake-calibrate") {
          applyBrakeCalibration(state, player, input.action, ctx);
        }
      }
    }

    if (state.phase !== "playing") return;

    const distance = config.playerSpeed * secondsPerTick;
    state.players.forEach((player) => {
      if (!player.connected || (player.moveX === 0 && player.moveZ === 0)) return;
      player.x = clamp(player.x + (player.moveX * distance) / WALKABLE.length, 0, 1);
      player.z = clamp(player.z + (player.moveZ * distance) / WALKABLE.width, 0, 1);
    });

    state.runTicks += 1;
    state.secondsRemaining = Math.max(0, Math.ceil(config.roundSeconds - state.runTicks * secondsPerTick));

    const allRepaired = state.tasks.every((task) => task.progress >= 100);
    if (!allRepaired) {
      state.trainCondition = Math.max(0, state.trainCondition - config.conditionDecayPerSecond * secondsPerTick);
    }

    if (allRepaired) state.phase = "victory";
    else if (state.secondsRemaining <= 0 || state.trainCondition <= 0) state.phase = "failure";
  },
};
