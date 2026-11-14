import { z } from "zod";

export const ReplayEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("join"),
    tick: z.number().int(),
    playerId: z.string(),
    /** What the client sent when it joined, after the game's `joinOptionsSchema` accepted it. */
    options: z.unknown().optional(),
  }),
  z.object({ type: z.literal("leave"), tick: z.number().int(), playerId: z.string() }),
  z.object({ type: z.literal("drop"), tick: z.number().int(), playerId: z.string() }),
  z.object({ type: z.literal("reconnect"), tick: z.number().int(), playerId: z.string() }),
  z.object({
    type: z.literal("input"),
    tick: z.number().int(),
    playerId: z.string(),
    seq: z.number().int(),
    input: z.unknown(),
  }),
  z.object({
    type: z.literal("debug"),
    tick: z.number().int(),
    playerId: z.string(),
    name: z.string(),
    args: z.unknown().optional(),
  }),
]);
export type ReplayEvent = z.infer<typeof ReplayEventSchema>;

export const ReplaySchema = z.object({
  version: z.literal(1),
  game: z.string(),
  seed: z.number().int(),
  config: z.unknown(),
  ticks: z.number().int().nonnegative(),
  events: z.array(ReplayEventSchema),
  /** Set when the event list hit the recording limit; a truncated replay cannot be re-run to the final state. */
  truncated: z.boolean().optional(),
  /** State hash after the last tick; a replay must reproduce it. */
  finalHash: z.string().optional(),
});
export type Replay = z.infer<typeof ReplaySchema>;
