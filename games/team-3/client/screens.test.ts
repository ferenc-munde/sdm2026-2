import { describe, expect, it } from "vitest";
import { endScreenFor } from "./screens.ts";

describe("endScreenFor", () => {
  it("shows a win screen with a play-again button", () => {
    const view = endScreenFor("won");
    expect(view).toMatchObject({ outcome: "won", action: "Play again" });
    expect(view?.title.length).toBeGreaterThan(0);
    expect(view?.detail.length).toBeGreaterThan(0);
  });

  it("shows a different lose screen", () => {
    const won = endScreenFor("won");
    const lost = endScreenFor("lost");
    expect(lost).toMatchObject({ outcome: "lost", action: "Play again" });
    expect(lost?.title).not.toBe(won?.title);
    expect(lost?.detail).not.toBe(won?.detail);
  });

  it("shows nothing while the run is going or before it starts", () => {
    expect(endScreenFor("playing")).toBeNull();
    expect(endScreenFor("lobby")).toBeNull();
  });
});
