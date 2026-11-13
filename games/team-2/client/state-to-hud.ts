import type { LastTrainState } from "../shared/state.ts";
import type { HudJourney } from "./hud";

/** Translate local rule state to presentation data, without changing state. */
export function localStateToHud(state: LastTrainState, tickRate: number, runStartTick: number) {
  const rate = Math.max(1, tickRate);
  const totalSeconds = state.timeLimitTicks / rate;
  const elapsed = state.phase === "lobby" ? 0 : Math.max(0, state.tick - runStartTick) / rate;
  const phase: HudJourney["phase"] = state.phase === "running" || state.phase === "won" || state.phase === "lost"
    ? state.phase : "lobby";
  return {
    tasks: Array.from(state.tasks, ([id, task]) => ({ id, title: task.title, current: task.current, target: task.target })),
    gauges: { power: state.power, pressure: state.pressure },
    journey: { distance: state.journeyDistance, remainingSeconds: Math.max(0, totalSeconds - elapsed), totalSeconds, phase,
      speed: state.paused || phase !== "running" ? 0 : state.speed },
    // Interim visual mapping; simulation speed is never written by the renderer.
    speed: phase === "running" && !state.paused && Number.isFinite(state.speed) ? Math.max(0, state.speed) : 0,
  };
}

/** Track active run ticks; lobby age and paused ticks must not consume time. */
export function createHudStateReader(tickRate: number) {
  let previous: { tick: number; phase: string; paused: boolean } | undefined;
  let elapsedTicks = 0;
  return (state: LastTrainState) => {
    if (!previous || state.tick < previous.tick || state.phase === "lobby" ||
      (state.phase === "running" && previous.phase !== "running")) elapsedTicks = 0;
    else if (previous.phase === "running" && !previous.paused) {
      elapsedTicks += Math.max(0, state.tick - previous.tick);
    }
    previous = { tick: state.tick, phase: state.phase, paused: state.paused };
    return localStateToHud(state, tickRate, state.tick - elapsedTicks);
  };
}
