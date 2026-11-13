import { BREACH_REPAIR_SECONDS, HULL_LOSS_PER_BREACH_PER_SECOND } from "../constants.ts";
import type { GameState } from "../types.ts";
import { canRepair, type Interactions } from "./interactions.ts";

/**
 * Advance once per fixed tick before journey movement. Owns breach hull loss;
 * the journey step must not subtract that damage again. Repairs do not stack.
 * A hazard damages the hull until the exact instant its repair completes.
 */
export function stepBreaches(state: GameState, inputs: Interactions, dt: number): GameState {
  if (state.phase !== "playing" || !Number.isFinite(dt) || dt <= 0) return state;
  const hazards = { ...state.hazards };
  let damage = 0;
  for (const hazard of Object.values(state.hazards)) {
    if (hazard.kind !== "breach") continue;
    const duration = BREACH_REPAIR_SECONDS;
    const repairing = canRepair(state, hazard, inputs, "wrench");
    const remaining = Math.max(0, (1 - hazard.progress) * duration);
    damage += (HULL_LOSS_PER_BREACH_PER_SECOND) *
      (repairing ? Math.min(dt, remaining) : dt);
    const progress = repairing ? hazard.progress + dt / duration : 0;
    if (progress >= 1 - 1e-9) delete hazards[hazard.id];
    else hazards[hazard.id] = { ...hazard, age: hazard.age + dt, progress };
  }
  const next = { ...state, hazards, journey: { ...state.journey, hull: Math.max(0, state.journey.hull - damage) } };
  return next;
}
