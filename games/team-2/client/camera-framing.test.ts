import { describe, expect, it } from "vitest";
import { followFrame, localCameraTarget, smoothCameraY } from "./camera-framing";
import { CAR_SPACING, CAR_WIDTH, CAR_X, MAP_HEIGHT } from "../shared/map.ts";

describe("local player camera", () => {
  it("follows the local id rather than the first player in the room", () => {
    const entries: [string, { x: number; y: number }][] = [["remote", { x: 800, y: 100 }], ["you", { x: 810, y: 600 }]];
    expect(localCameraTarget(entries, "you")).toEqual({ x: 810, y: 600 });
    expect(localCameraTarget(entries, "absent")).toBeNull();
    expect(localCameraTarget(entries)).toBeNull();
  });
  it("frames about two cars with a clear full carriage width at desktop and narrow sizes", () => {
    for (const [width, height] of [[1280, 720], [700, 800], [320, 740]]) {
      const frame = followFrame({ x: 800, y: 500 }, width! / (height! - 180));
      expect(frame.height).toBeGreaterThanOrEqual(CAR_SPACING * 2);
      expect(frame.width).toBeGreaterThanOrEqual(CAR_WIDTH + 96);
      expect(frame.centerX - frame.width / 2).toBeLessThan(CAR_X);
      expect(frame.centerX + frame.width / 2).toBeGreaterThan(CAR_X + CAR_WIDTH);
    }
  });
  it("keeps the first and last carriage inside the map and follows passage positions", () => {
    const first = followFrame({ x: 800, y: 65 }, 1.5);
    const last = followFrame({ x: 800, y: 860 }, 1.5);
    expect(first.centerY - first.height / 2).toBe(0);
    expect(last.centerY + last.height / 2).toBe(MAP_HEIGHT);
    expect(followFrame({ x: 800, y: 375 }, 1.5).centerY).toBe(375);
  });
  it("moves smoothly without overshoot and is independent of frame rate", () => {
    const one = smoothCameraY(0, 100, 1 / 30);
    const two = smoothCameraY(smoothCameraY(0, 100, 1 / 60), 100, 1 / 60);
    expect(one).toBeCloseTo(two);
    expect(one).toBeGreaterThan(0); expect(one).toBeLessThan(100);
    expect(smoothCameraY(5, 100, 0)).toBe(5);
  });
});
