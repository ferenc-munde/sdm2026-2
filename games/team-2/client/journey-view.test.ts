import { describe, expect, it } from "vitest";
import { journeyView } from "./journey-view";
import type { HudJourney } from "./hud";

const running: HudJourney = { distance: 0.4, remainingSeconds: 150, totalSeconds: 300, phase: "running", speed: 0.003 };
describe("journey display", () => {
  it("shows real progress, distance left, countdown and speed with the schedule ghost", () => {
    const view = journeyView(running);
    expect(view.distanceText).toBe("40.0% travelled · 60.0% left");
    expect(view.timeText).toBe("2:30");
    expect(view.speedText).toBe("0.30% route/s");
    expect(view.required).toBe(0.5);
    expect(view.behind).toBe(true);
    expect(journeyView({ ...running, distance: 0.5 }).behind).toBe(false);
    expect(journeyView({ ...running, distance: 0.6 }).behind).toBe(false);
  });
  it("keeps markers within the track and handles invalid values and expired time", () => {
    const view = journeyView({ ...running, distance: 2, remainingSeconds: -1, speed: NaN });
    expect(view.distance).toBe(1); expect(view.required).toBe(1);
    expect(view.distanceText).toBe("100.0% travelled · 0.0% left");
    expect(view.timeText).toBe("0:00"); expect(view.speedText).toBe("0.00% route/s");
    expect(journeyView({ ...running, distance: NaN, totalSeconds: 0 }).required).toBe(0);
  });
  it("does not display running schedule alarms in the lobby or after a result", () => {
    for (const phase of ["lobby", "won", "lost"] as const) expect(journeyView({ ...running, phase }).behind).toBe(false);
    expect(journeyView({ ...running, remainingSeconds: 60.1 }).timeText).toBe("1:01");
  });
});
