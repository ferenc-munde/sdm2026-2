import { BREACH_REPAIR_SECONDS } from "../constants.ts";
import type { StepSystem } from "../run/session.ts";
import type { GameState } from "../types.ts";
import { canRepair, type Interactions } from "./interactions.ts";

/** Repair progress only. The journey system owns all continuous hull damage. */
export function stepBreaches(state: GameState, inputs: Interactions, dt: number): GameState {
  if (state.phase !== "playing" || !Number.isFinite(dt) || dt <= 0) return state;
  const hazards = { ...state.hazards };
  for (const hazard of Object.values(state.hazards)) {
    if (hazard.kind !== "breach") continue;
    const duration = BREACH_REPAIR_SECONDS;
    const repairing = canRepair(state, hazard, inputs, "wrench");
    const progress = repairing ? hazard.progress + dt / duration : 0;
    if (progress >= 1 - 1e-9) delete hazards[hazard.id];
    else hazards[hazard.id] = { ...hazard, age: hazard.age + dt, progress };
  }
  return { ...state, hazards };
}

/** Run after journeySystem so each active breach damages the hull once per tick. */
export const breachSystem: StepSystem = (state, dt, frame) =>
  stepBreaches(state, Object.fromEntries(Object.entries(frame.inputs).map(([id, input]) => [id, input.interacting])), dt);
