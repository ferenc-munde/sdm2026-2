import { describe, expect, it } from "vitest";
import { endScreenFor, runSummary } from "./screens.ts";

describe("endScreenFor", () => {
  it("shows a win screen with a play-again button", () => {
    const view = endScreenFor("won");
    expect(view).toMatchObject({ outcome: "won", action: "New run", canStart: true });
    expect(view?.title.length).toBeGreaterThan(0);
    expect(view?.detail.length).toBeGreaterThan(0);
  });

  it("shows a different lose screen", () => {
    const won = endScreenFor("won");
    const lost = endScreenFor("lost");
    expect(lost).toMatchObject({ outcome: "lost", action: "New run" });
    expect(lost?.title).not.toBe(won?.title);
    expect(lost?.detail).not.toBe(won?.detail);
  });

  it("summarises the run and gives only the host the new-run control", () => {
    const summary = { distance: 812.6, time: 125, hull: 42.4 };
    expect(runSummary(summary)).toBe("Distance 813 m · Time 2:05 · Hull 42%");
    expect(endScreenFor("won", summary, true)).toMatchObject({
      summary: "Distance 813 m · Time 2:05 · Hull 42%",
      action: "New run",
      canStart: true,
    });
    expect(endScreenFor("lost", summary, false)).toMatchObject({
      action: "Waiting for the host…",
      canStart: false,
    });
  });

  it("shows nothing while the run is going or before it starts", () => {
    expect(endScreenFor("playing")).toBeNull();
    expect(endScreenFor("lobby")).toBeNull();
  });
});
