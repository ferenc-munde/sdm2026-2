import { z } from "zod";

export const gameConfigSchema = z
	.object({
		tickRate: z.number().int().min(10).max(60),
		patchRate: z.number().int().min(5).max(60),
		maxPlayers: z.number().int().min(2).max(4),
		reconnectSeconds: z.number().int().min(5).max(120),
		timeLimitSeconds: z.number().int().min(60).max(1200),
	})
	.passthrough()
	.refine(
		(c) => c.patchRate <= c.tickRate,
		{ message: "patchRate must not exceed tickRate" },
	);

export type GameConfig = z.infer<typeof gameConfigSchema>;

export function parseGameConfig(json: unknown): GameConfig {
	return gameConfigSchema.parse(json);
}
