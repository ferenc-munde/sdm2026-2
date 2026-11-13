import { MapSchema, Schema, type } from "@colyseus/schema";
import { z } from "zod";
import type { SeededRandom } from "../shared";

export class Seat extends Schema {
  @type("string") playerId = "";
  @type("boolean") connected = true;
  @type("number") lastSeq = 0;
}

/** Fields every game state has; the room base owns them, games never write them. */
export class BaseState extends Schema {
  @type("number") tick = 0;
  @type("string") code = "";
  @type("boolean") paused = false;
  @type({ map: Seat }) seats = new MapSchema<Seat>();
}

export const RoomSettingsSchema = z.object({
  tickRate: z.number().int().min(1).max(120).default(20),
  patchRate: z.number().int().min(1).max(120).default(20),
  maxPlayers: z.number().int().min(1).max(64).default(4),
  reconnectSeconds: z.number().int().min(0).max(300).default(20),
});
export type RoomSettings = z.infer<typeof RoomSettingsSchema>;

export interface GameContext {
  random: SeededRandom;
}

export interface PlayerInput<I> {
  playerId: string;
  input: I;
}

export interface GameDefinition<
  S extends BaseState = BaseState,
  C extends RoomSettings = RoomSettings,
  I = unknown,
> {
  id: string;
  configSchema: z.ZodType<C, unknown>;
  inputSchema: z.ZodType<I, unknown>;
  createState(config: C): S;
  init(state: S, ctx: GameContext): void;
  join(state: S, playerId: string, ctx: GameContext): void;
  leave(state: S, playerId: string, ctx: GameContext): void;
  /** Runs once per fixed tick with the inputs received since the last tick. */
  step(state: S, inputs: PlayerInput<I>[], ctx: GameContext): void;
  disconnect?(state: S, playerId: string, ctx: GameContext): void;
  reconnect?(state: S, playerId: string, ctx: GameContext): void;
  /** Debug commands: recorded in replays, rejected in production. */
  commands?: Record<string, (state: S, args: unknown, ctx: GameContext) => void>;
}
