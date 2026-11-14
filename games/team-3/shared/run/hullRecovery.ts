// The hull slowly recovers while the train is safe (play-test feedback: "the hull only goes down
// and we don't know how to get it up").
//
// While no breach or fire is open, the crew's earlier repairs "settle" and the hull climbs back
// toward HULL_MAX at a gentle rate. A course (sharp curve) warning doesn't stop it. This makes
// fixing hazards quickly the way to win the hull back, without changing any hazard rule.
// Deterministic and stateless: it only reads the state it is given.

import { HULL_MAX } from "../constants.ts";
import type { GameState } from "../types.ts";
import type { StepSystem } from "./session.ts";

/** Hull points recovered per second while no breach or fire is open. */
export const HULL_RECOVERY_PER_SECOND = 1;

/** True when nothing on the train is damaging the hull. */
export function trainIsSafe(state: GameState): boolean {
  return !Object.values(state.hazards).some((hazard) => hazard.kind === "breach" || hazard.kind === "fire");
}

export const hullRecoverySystem: StepSystem = (state, dt) => {
  if (state.phase !== "playing" || !(dt > 0) || !trainIsSafe(state)) return state;
  const hull = state.journey.hull;
  if (hull <= 0 || hull >= HULL_MAX) return state;
  return { ...state, journey: { ...state.journey, hull: Math.min(HULL_MAX, hull + HULL_RECOVERY_PER_SECOND * dt) } };
};
