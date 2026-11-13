import type { Rng } from "./types.ts";

/**
 * mulberry32 — small, fast, fully deterministic. Stand-in for the platform's
 * `SeededRandom` (swapped in with @sdm/core, #73); the interface is identical.
 */
export class SeededRandom implements Rng {
	private s: number;

	constructor(seed: number) {
		this.s = seed >>> 0;
	}

	next(): number {
		this.s = (this.s + 0x6d2b79f5) >>> 0;
		let t = this.s;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	}

	int(maxInclusive: number): number {
		return Math.floor(this.next() * (maxInclusive + 1));
	}

	pick<T>(items: readonly T[]): T {
		return items[this.int(items.length - 1)] as T;
	}
}
