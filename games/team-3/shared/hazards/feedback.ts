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
    .filter((hazard) => hazard.kind !== "course" || next.journey.hull >= previous.journey.hull)
    .map(({ id, kind }) => ({ id, kind }));
}
