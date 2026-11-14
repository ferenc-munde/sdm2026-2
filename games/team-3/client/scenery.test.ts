import { describe, expect, it } from "vitest";
import { SCENERY_FULL_SPEED, SLEEPER_SPACING, buildScenery, sceneryOffset } from "./scenery.ts";

const bounds = { left: -210, right: 1074, depth: 220 };

describe("sceneryOffset", () => {
  it("shifts the line by the distance travelled, towards +x", () => {
    // Car 0 is the front at the low-x end and the train moves towards -x, so the
    // ground slides towards +x.
    expect(sceneryOffset(0)).toBe(0);
    expect(sceneryOffset(10)).toBe(10);
    expect(sceneryOffset(45)).toBe(45);
  });

  it("wraps at one sleeper spacing so the line loops", () => {
    expect(sceneryOffset(SLEEPER_SPACING)).toBe(0);
    expect(sceneryOffset(SLEEPER_SPACING + 5)).toBe(5);
    for (const distance of [0, 1, 89, 90, 179, 900, 12_345]) {
      const offset = sceneryOffset(distance);
      expect(offset).toBeGreaterThanOrEqual(0);
      expect(offset).toBeLessThan(SLEEPER_SPACING);
    }
  });

  it("is stable for broken values", () => {
    expect(sceneryOffset(Number.NaN)).toBe(0);
    expect(sceneryOffset(10, 0)).toBe(0);
    expect(sceneryOffset(10, Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("scenery", () => {
  it("covers the train plus a margin with sleepers", () => {
    const scenery = buildScenery(bounds);
    const sleepers = scenery.group.children.filter((child) => child.userData.kind === "sleeper");
    expect(sleepers.length).toBeGreaterThan(Math.ceil((bounds.right - bounds.left) / SLEEPER_SPACING));
    expect(scenery.group.children.some((child) => child.name === "ground")).toBe(true);
  });

  it("moves at full speed, stops when stalled and slows at half speed", () => {
    const scenery = buildScenery(bounds);

    scenery.update(0.5, 1); // 0.5 s * 160 = 80 units
    expect(scenery.group.position.x).toBe(80);

    scenery.update(0.5, 0); // stalled: nothing moves
    expect(scenery.group.position.x).toBe(80);

    scenery.update(0.5, 0.5); // +40 -> 120, wrapped to 30
    expect(scenery.group.position.x).toBe(30);

    expect(SCENERY_FULL_SPEED).toBe(160);
  });

  it("does not move backwards or faster than full speed", () => {
    const scenery = buildScenery(bounds);
    scenery.update(1, -1); // clamped to 0
    expect(scenery.group.position.x).toBe(0);

    scenery.update(0.5, 2); // clamped to 1
    expect(scenery.group.position.x).toBe(80);
  });

  it("ignores broken updates instead of jumping", () => {
    const scenery = buildScenery(bounds);
    scenery.update(0.5, 1);
    const before = scenery.group.position.x;
    scenery.update(Number.NaN, 1);
    scenery.update(0.5, Number.NaN); // factor becomes 0
    scenery.update(-1, 1);
    expect(scenery.group.position.x).toBe(before);
  });

  it("can be disposed without throwing", () => {
    const scenery = buildScenery(bounds);
    expect(() => scenery.dispose()).not.toThrow();
  });
  it("lays two steel rails beside the cars and poles that loop with the sleepers (#217)", () => {
    const scenery = buildScenery(bounds);
    const rails = scenery.group.children.filter((child) => child.userData.kind === "rail");
    expect(rails.map((rail) => Math.sign(rail.position.z)).sort()).toEqual([-1, 1]);
    for (const rail of rails) expect(Math.abs(rail.position.z)).toBeGreaterThan(bounds.depth / 2);
    let poles = 0;
    scenery.group.traverse((child) => { if (child.userData.kind === "pole") poles += 1; });
    expect(poles).toBeGreaterThan(0);
  });
});
