// Plain constants shared by the rules and the client. No imports, so the client can use them
// without pulling the schema classes into its bundle.

export const GAME_ID = "team-1";

/** Longest crew name the room accepts. The lobby inputs use the same limit. */
export const MAX_NAME_LENGTH = 18;

/** Player colours, assigned by seat order (seat 0 gets the first colour). */
export const PLAYER_COLORS = ["#d6ac68", "#8bb8a4", "#c78875", "#8f9dcc"] as const;

export const PHASES = ["lobby", "playing", "victory", "failure"] as const;
export type Phase = (typeof PHASES)[number];
