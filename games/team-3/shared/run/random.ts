// A seeded random source for the rules. The same seed always gives the same sequence,
// so a run can be replayed exactly. Rules never call Math.random().

/** Anything that returns numbers in [0, 1). The platform's SeededRandom can be adapted to this. */
export interface RandomSource {
  next(): number;
}

/** Creates a deterministic random source from an integer seed (mulberry32). */
export function createSeededRandom(seed: number): RandomSource {
  let a = seed >>> 0;
  return {
    next(): number {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/** Picks an index from 0 to length - 1. Throws for an empty range, because there is nothing to pick. */
export function pickIndex(random: RandomSource, length: number): number {
  if (!Number.isInteger(length) || length <= 0) throw new Error("pickIndex needs a positive length");
  return Math.min(length - 1, Math.floor(random.next() * length));
}
