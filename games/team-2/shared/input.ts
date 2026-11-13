import { z } from "zod";

/**
 * What a client may send while playing. The platform room wraps every input in
 * a `{ seq, input }` envelope and drops repeats, so inputs carry no `seq`.
 */
export const clientInputSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("move"), mx: z.number().min(-1).max(1), my: z.number().min(-1).max(1), run: z.boolean() }),
	z.object({ type: z.literal("interactDown"), stationId: z.string().min(1).max(64) }),
	z.object({ type: z.literal("interactUp"), stationId: z.string().min(1).max(64) }),
	z.object({ type: z.literal("progress"), taskId: z.string().min(1).max(64), amount: z.number().int().min(1).max(4) }),
	z.object({ type: z.literal("pickup"), itemId: z.string().min(1).max(64) }),
	z.object({ type: z.literal("drop"), itemId: z.string().min(1).max(64) }),
	z.object({ type: z.literal("startRun") }),
]);

export type ClientInput = z.infer<typeof clientInputSchema>;

/** What a client sends when it creates or joins the game room. */
export const joinOptionsSchema = z.object({
	name: z.string().trim().min(1, "a name needs at least one character").max(16, "a name has at most 16 characters").optional(),
});

export type JoinOptions = z.infer<typeof joinOptionsSchema>;
