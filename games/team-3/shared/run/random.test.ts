import { describe, expect, it } from "vitest";
import { createSeededRandom, pickIndex } from "./random.ts";

describe("seeded random", () => {
  it("gives the same sequence for the same seed", () => {
    const a = createSeededRandom(42);
    const b = createSeededRandom(42);
    const first = Array.from({ length: 20 }, () => a.next());
    const second = Array.from({ length: 20 }, () => b.next());
    expect(first).toEqual(second);
  });

  it("gives different sequences for different seeds", () => {
    expect(createSeededRandom(1).next()).not.toBe(createSeededRandom(2).next());
  });

  it("stays in [0, 1)", () => {
    const random = createSeededRandom(7);
    for (let i = 0; i < 1000; i++) {
      const n = random.next();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });

  it("picks every index of a range and never leaves it", () => {
    const random = createSeededRandom(3);
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) seen.add(pickIndex(random, 4));
    expect([...seen].sort()).toEqual([0, 1, 2, 3]);
    expect(pickIndex({ next: () => 0.999999999 }, 3)).toBe(2);
  });

  it("refuses an empty range", () => {
    expect(() => pickIndex(createSeededRandom(1), 0)).toThrow();
  });
});
