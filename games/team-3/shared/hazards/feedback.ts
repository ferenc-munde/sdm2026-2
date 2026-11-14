import { COURSE_HULL_DAMAGE } from "../constants.ts";
import type { GameState, HazardKind } from "../types.ts";

export interface FixedHazard {
  id: string;
  kind: HazardKind;
}

/** Hazards cleared successfully between two authoritative room snapshots. */
export function fixedHazardsBetween(previous: GameState, next: GameState): FixedHazard[] {
  if (previous.phase !== "playing" || next.phase !== "playing") return [];
  return Object.values(previous.hazards)
    .filter((hazard) => !next.hazards[hazard.id])
    // A failed curve costs COURSE_HULL_DAMAGE at once; a breach elsewhere only drains a little per tick.
    .filter((hazard) => hazard.kind !== "course" || previous.journey.hull - next.journey.hull < COURSE_HULL_DAMAGE)
    .map(({ id, kind }) => ({ id, kind }));
}
