import { FIRE_SPREAD_SECONDS } from "../constants.ts";
import { freeSpots, type HazardSpot } from "../run/director.ts";
import type { StepSystem } from "../run/session.ts";
import type { GameState } from "../types.ts";

/** Run after fireSystem, which advances fire ages. No second age increment here. */
export function spreadFires(state: GameState, spots: readonly HazardSpot[]): GameState {
  if (state.phase !== "playing") return state;
  const hazards = { ...state.hazards };
  for (const source of Object.values(state.hazards).sort((a, b) => a.id.localeCompare(b.id))) {
    if (source.kind !== "fire" || source.age < FIRE_SPREAD_SECONDS - 1e-9 || source.progress > 0) continue;
    const free = freeSpots(spots, hazards).sort((a, b) => {
      const distance = (s: HazardSpot) => Math.hypot(s.position.x - source.position.x, s.position.y - source.position.y);
      return distance(a) - distance(b) || a.id.localeCompare(b.id);
    });
    const target = free[0];
    if (!target) continue;
    let serial = 1;
    while (hazards[`spread-${source.id}-${serial}`]) serial++;
    const id = `spread-${source.id}-${serial}`;
    hazards[id] = { ...source, id, spotId: target.id, car: target.car, position: { ...target.position }, age: 0, progress: 0 };
    hazards[source.id] = { ...source, age: 0 };
  }
  return { ...state, hazards };
}
export const fireSpreadSystem = (spots: readonly HazardSpot[]): StepSystem => state => spreadFires(state, spots);
