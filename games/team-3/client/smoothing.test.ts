import { describe, expect, it } from "vitest";
import { createSmoother, SNAP_DISTANCE, withPositions } from "./smoothing.ts";

describe("smoothing between room updates", () => {
  it("starts at the server position, then glides toward each new one instead of stepping", () => {
    const smoother = createSmoother();
    expect(smoother.step({ a: { x: 0, y: 0 } }, 1 / 60)).toEqual({ a: { x: 0, y: 0 } });
    const frame = smoother.step({ a: { x: 8, y: 0 } }, 1 / 60); // one 20 Hz update of walking
    expect(frame.a!.x).toBeGreaterThan(0);
    expect(frame.a!.x).toBeLessThan(8);
    let x = frame.a!.x;
    for (let i = 0; i < 12; i++) x = smoother.step({ a: { x: 8, y: 0 } }, 1 / 60).a!.x;
    expect(x).toBeCloseTo(8, 0); // caught up within 0.2 s
  });

  it("snaps across big jumps such as boarding the train", () => {
    const smoother = createSmoother();
    smoother.step({ a: { x: 0, y: 0 } }, 1 / 60);
    expect(smoother.step({ a: { x: SNAP_DISTANCE + 1, y: 0 } }, 1 / 60).a).toEqual({ x: SNAP_DISTANCE + 1, y: 0 });
  });

  it("forgets ids that left, and keeps other fields when applying positions", () => {
    const smoother = createSmoother();
    smoother.step({ a: { x: 0, y: 0 }, b: { x: 5, y: 5 } }, 1 / 60);
    expect(Object.keys(smoother.step({ a: { x: 0, y: 0 } }, 1 / 60))).toEqual(["a"]);
    const players = { a: { id: "a", name: "Ada", position: { x: 9, y: 9 } } };
    expect(withPositions(players, { a: { x: 1, y: 2 } })).toEqual([{ id: "a", name: "Ada", position: { x: 1, y: 2 } }]);
  });
});
