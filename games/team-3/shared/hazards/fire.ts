import { FIRE_EXTINGUISH_SECONDS } from "../constants.ts";
import type { StepSystem } from "../run/session.ts";
import type { GameState } from "../types.ts";
import { canRepair, type Interactions } from "./interactions.ts";

import { LOW_FUEL_THRESHOLD, SPEED_FACTOR_FULL, SPEED_FACTOR_LOW, SPEED_FACTOR_STOPPED } from "../constants.ts";

/** Journey rules can use this too; a fire only stalls the engine spot. */
export function speedFactorForHazards(state: GameState): number {
  if (state.journey.fuel <= 0 || Object.values(state.hazards).some(h => h.kind === "fire" && h.spotId === "engine")) {
    return SPEED_FACTOR_STOPPED;
  }
  return state.journey.fuel <= LOW_FUEL_THRESHOLD ? SPEED_FACTOR_LOW : SPEED_FACTOR_FULL;
}

/** Extinguishing only; journeySystem owns continuous fire damage. */
export function stepFires(state: GameState, inputs: Interactions, dt: number): GameState {
  if (state.phase !== "playing" || !Number.isFinite(dt) || dt <= 0) return state;
  const hazards = { ...state.hazards };
  for (const hazard of Object.values(state.hazards)) {
    if (hazard.kind !== "fire") continue;
    const duration = FIRE_EXTINGUISH_SECONDS;
    const repairing = canRepair(state, hazard, inputs, "extinguisher");
    const progress = repairing ? hazard.progress + dt / duration : 0;
    if (progress >= 1 - 1e-9) delete hazards[hazard.id];
    else hazards[hazard.id] = { ...hazard, age: hazard.age + dt, progress };
  }
  const next = { ...state, hazards, journey: { ...state.journey, speedFactor: state.journey.speedFactor } };
  next.journey.speedFactor = speedFactorForHazards(next);
  return next;
}

/** Run after journeySystem; the final extinguishing tick damages once. */
export const fireSystem: StepSystem = (state, dt, frame) =>
  stepFires(state, Object.fromEntries(Object.entries(frame.inputs).map(([id, input]) => [id, input.interacting])), dt);
