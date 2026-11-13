import { z } from "zod";

const seq = z.number().int().min(0);

export const clientInputSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("move"), seq, mx: z.number().min(-1).max(1), my: z.number().min(-1).max(1), run: z.boolean() }),
	z.object({ type: z.literal("interactDown"), seq, stationId: z.string().min(1).max(64) }),
	z.object({ type: z.literal("interactUp"), seq, stationId: z.string().min(1).max(64) }),
	z.object({ type: z.literal("progress"), seq, taskId: z.string().min(1).max(64), amount: z.number().int().min(1).max(4) }),
	z.object({ type: z.literal("pickup"), seq, itemId: z.string().min(1).max(64) }),
	z.object({ type: z.literal("drop"), seq, itemId: z.string().min(1).max(64) }),
	z.object({ type: z.literal("startRun"), seq }),
]);

export type ClientInput = z.infer<typeof clientInputSchema>;
