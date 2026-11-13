// The Last Train (Team 1): the rules, as a platform GameDefinition (issue #240).
// Browser-safe and deterministic: no Math.random, no wall-clock time, no node:* imports.
// Time advances only in fixed ticks; one tick is 1 / config.tickRate seconds.
import { ArraySchema, MapSchema, Schema, type } from "@colyseus/schema";
import { z } from "zod";
import { BaseState, RoomSettingsSchema, type GameContext, type GameDefinition } from "@sdm/core/sim";
import { GAME_ID, MAX_NAME_LENGTH, PLAYER_COLORS, type Phase } from "./constants";
import { SECTION_TITLES, TASK_CATALOGUE, WALKABLE, sectionAt, type TaskDefinition } from "./train-layout";

export { GAME_ID, MAX_NAME_LENGTH, PLAYER_COLORS, type Phase };

export class PlayerState extends Schema {
  @type("string") name = "";
  /** Seat index, 0 for the first free seat. Decides the colour and the spawn point. */
  @type("number") seat = 0;
  @type("string") color = "";
  @type("boolean") connected = true;
  /** Position inside the walkable area, both normalised to 0..1 (x along the train, z across it). */
  @type("number") x = 0.5;
  @type("number") z = 0.5;
  /** The direction the player is walking in, length at most 1. Set by the `move` input. */
  @type("number") moveX = 0;
  @type("number") moveZ = 0;
}

export class TaskState extends Schema {
  @type("string") id = "";
  @type("string") label = "";
  /** The train section a player must stand in to repair this task. */
  @type("string") section = "";
  /** 0..100; the task is complete at 100. */
  @type("number") progress = 0;
}

export class TrainState extends BaseState {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type([TaskState]) tasks = new ArraySchema<TaskState>();
  /** "lobby" | "playing" | "victory" | "failure" */
  @type("string") phase: Phase = "lobby";
  /** Ticks played in the current run. */
  @type("number") runTicks = 0;
  /** Whole seconds left in the run (rounded up). */
  @type("number") secondsRemaining = 0;
  /** 0..100; the run fails at 0. */
  @type("number") trainCondition = 100;
}

export const ConfigSchema = RoomSettingsSchema.extend({
  /** Length of one run. */
  roundSeconds: z.number().int().min(10).max(3600),
  /** Walking speed in world units per second (the train is 26 units long). */
  playerSpeed: z.number().positive().max(50),
  /** How many repairs a run has. */
  taskCount: z.number().int().min(1).max(TASK_CATALOGUE.length),
  /** Progress points (of 100) one `repair` input adds. */
  repairStep: z.number().positive().max(100),
  /** Train condition lost per second while a repair is still open. */
  conditionDecayPerSecond: z.number().min(0).max(100),
  /** Train condition won back when a repair is completed. */
  repairConditionBonus: z.number().min(0).max(100),
});
export type TrainConfig = z.infer<typeof ConfigSchema>;

const axis = z.number().min(-1).max(1);

export const InputSchema = z.discriminatedUnion("type", [
  /** Walk in this direction until the next `move`; `{ x: 0, z: 0 }` stops. */
  z.object({ type: z.literal("move"), x: axis, z: axis }),
  /** Begin a run from the lobby, or a new one after a victory or failure. */
  z.object({ type: z.literal("start") }),
  /** Work on the open repair in the section the player stands in. */
  z.object({ type: z.literal("repair") }),
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

/** Where the player in this seat starts: spread along the middle of the train. */
export function spawnPoint(seat: number): { x: number; z: number } {
  return { x: 0.18 + (seat % 4) * 0.2, z: 0.5 };
}

/** The open task a player at this position could repair right now, if any. */
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

/** Picks `taskCount` different repairs with the room's seeded random, all at progress 0. */
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
  if (!task) return;
  task.progress = Math.min(100, task.progress + ctx.config.repairStep);
  if (task.progress >= 100) {
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
    const repairedThisTick = new Set<string>();

    for (const { playerId, input } of inputs) {
      const player = state.players.get(playerId);
      if (!player) continue;
      if (input.type === "move") {
        // The schema keeps each axis in -1..1; a longer diagonal is scaled back to length 1.
        const length = Math.hypot(input.x, input.z);
        const scale = length > 1 ? 1 / length : 1;
        player.moveX = input.x * scale;
        player.moveZ = input.z * scale;
      } else if (input.type === "start") {
        if (state.phase !== "playing") {
          resetRun(state, ctx);
          state.phase = "playing";
        }
      } else if (state.phase === "playing" && !repairedThisTick.has(playerId)) {
        // At most one repair step per player per tick, however fast the key is pressed.
        repairedThisTick.add(playerId);
        applyRepair(state, player, ctx);
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
