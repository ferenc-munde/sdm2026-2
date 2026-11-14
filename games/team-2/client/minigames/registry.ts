import { crank } from "./crank.ts";
import { panel } from "./panel.ts";
import { wires } from "./wires.ts";
import type { MinigameFactory } from "./types.ts";

/**
 * The minigame catalogue the task director's `minigame` ids point at. Add a
 * minigame by adding a file here and a matching id in shared/tasks.ts; the
 * shared test keeps the two lists in lockstep.
 */
export const MINIGAMES: Record<string, MinigameFactory> = {
  wires,
  crank,
  panel,
};
