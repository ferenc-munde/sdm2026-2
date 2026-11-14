import type { LastTrainState } from "../shared/state.ts";
import type { HudJourney } from "./hud";

/**
 * Translate rule state to presentation data, without changing state. The run clock comes from
 * `state.runTicks`, which the rules keep on the server: the client never counts ticks itself, so a
 * player who joins late or reconnects sees the same remaining time as everyone else.
 */
export function localStateToHud(state: LastTrainState, tickRate: number) {
  const rate = Math.max(1, tickRate);
  const totalSeconds = state.timeLimitTicks / rate;
  const elapsed = state.phase === "lobby" ? 0 : Math.max(0, state.runTicks) / rate;
  const phase: HudJourney["phase"] = state.phase === "running" || state.phase === "won" || state.phase === "lost"
    ? state.phase : "lobby";
  return {
    tasks: Array.from(state.tasks, ([id, task]) => ({ id, title: task.title, type: task.type, current: task.current, target: task.target })),
    gauges: { power: state.power, pressure: state.pressure },
    journey: { distance: state.journeyDistance, remainingSeconds: Math.max(0, totalSeconds - elapsed), totalSeconds, phase,
      speed: state.paused || phase !== "running" ? 0 : state.speed },
    // Interim visual mapping; simulation speed is never written by the renderer.
    speed: phase === "running" && !state.paused && Number.isFinite(state.speed) ? Math.max(0, state.speed) : 0,
  };
}
