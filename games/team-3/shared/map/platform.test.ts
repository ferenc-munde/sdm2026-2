import { describe, expect, it } from "vitest";
import { INTERACT_RANGE, PLAYER_RADIUS } from "../constants.ts";
import { insideBox } from "./map.ts";
import { createPlatformMap, OBJECT_SPACING, platformObjects, validatePlatform } from "./platform.ts";

const platform = createPlatformMap();

describe("platform object spacing (#199)", () => {
  it("keeps objects more than twice the reach apart", () => {
    expect(OBJECT_SPACING).toBe(2 * INTERACT_RANGE);
    expect(validatePlatform(platform)).toEqual([]);
  });

  it("has no spot on the floor within reach of two objects", () => {
    const objects = platformObjects(platform);
    const { floor } = platform;
    for (let x = floor.x - floor.width / 2; x <= floor.x + floor.width / 2; x += 5) {
      for (let y = floor.y - floor.depth / 2; y <= floor.y + floor.depth / 2; y += 5) {
        if (!insideBox(floor, { x, y }, PLAYER_RADIUS)) continue;
        const inReach = objects.filter((o) => Math.hypot(o.position.x - x, o.position.y - y) <= INTERACT_RANGE);
        expect(inReach.length, `(${x}, ${y}) reaches ${inReach.map((o) => o.name).join(" and ")}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("reports two objects exactly twice the reach apart, since the midpoint reaches both", () => {
    const tight = createPlatformMap();
    tight.objects.boiler = { x: tight.objects.coalPile.x + 2 * INTERACT_RANGE, y: tight.objects.coalPile.y };
    expect(validatePlatform(tight)).toContain("coal pile and boiler are too close");
  });

  it("accepts objects just over twice the reach apart", () => {
    const ok = createPlatformMap();
    ok.objects.boiler = { x: ok.objects.coalPile.x + 2 * INTERACT_RANGE + 1, y: ok.objects.coalPile.y };
    expect(validatePlatform(ok).filter((p) => p.includes("coal pile and boiler"))).toEqual([]);
  });
});
