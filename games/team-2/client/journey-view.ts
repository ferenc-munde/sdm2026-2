import type { HudJourney } from "./hud";

/** Read-only display values: never decides whether the run wins or loses. */
export function journeyView(values: HudJourney) {
  const nonnegative = (n: number) => Number.isFinite(n) ? Math.max(0, n) : 0;
  const distance = Math.min(1, nonnegative(values.distance));
  const total = nonnegative(values.totalSeconds);
  const remaining = Math.min(total, nonnegative(values.remainingSeconds));
  const seconds = Math.ceil(remaining);
  const required = total > 0 ? 1 - remaining / total : 0;
  return {
    distance, required,
    distanceText: `${(distance * 100).toFixed(1)}% travelled · ${((1 - distance) * 100).toFixed(1)}% left`,
    timeText: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`,
    // SPEC: normalized route distance advances by speed * dt; no invented km/h.
    speedText: `${(nonnegative(values.speed ?? 0) * 100).toFixed(2)}% route/s`,
    behind: values.phase === "running" && distance + 0.000001 < required,
  };
}
