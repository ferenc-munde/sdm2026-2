import { z } from "zod";
import { RoomSettingsSchema } from "@sdm/core/sim";

/**
 * The platform's room settings with this game's tighter limits, plus tuning
 * values for the rules. Everything here is set in `config/game.json`.
 */
export const gameConfigSchema = RoomSettingsSchema.extend({
	tickRate: z.number().int().min(10).max(60),
	patchRate: z.number().int().min(5).max(60),
	maxPlayers: z.number().int().min(2).max(4),
	reconnectSeconds: z.number().int().min(5).max(120),
	timeLimitSeconds: z.number().int().min(60).max(1200),
	/** Walking and running speed in map units per second (see shared/map.ts). */
	walkSpeed: z.number().positive().max(1000).default(120),
	runSpeed: z.number().positive().max(1000).default(200),
	/** Journey tuning: speed is a fraction of the full route per second. */
	cruiseTravelSeconds: z.number().positive().max(1200).default(200),
	taskSpeedDrag: z.number().min(0).max(0.5).default(0.2),
	hazardSpeedDrag: z.number().min(0).max(0.5).default(0.08),
	maxSpeedDrag: z.number().min(0).max(0.95).default(0.85),
})
	.passthrough()
	.refine(
		(c) => c.patchRate <= c.tickRate,
		{ message: "patchRate must not exceed tickRate" },
	)
	.refine(
		(c) => c.tickRate * c.timeLimitSeconds <= 65535,
		{
			message:
				"tickRate × timeLimitSeconds must fit the uint16 tick budget (65535) used by the state schema",
		},
	);

export type GameConfig = z.infer<typeof gameConfigSchema>;

export function parseGameConfig(json: unknown): GameConfig {
	return gameConfigSchema.parse(json);
}
