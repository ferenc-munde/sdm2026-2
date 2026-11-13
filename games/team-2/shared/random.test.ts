import { describe, expect, it } from "vitest";
import { SeededRandom } from "./random.ts";

describe("SeededRandom", () => {
	it("produces the same sequence for the same seed", () => {
		const a = new SeededRandom(42);
		const b = new SeededRandom(42);
		const seqA = Array.from({ length: 10 }, () => a.next());
		const seqB = Array.from({ length: 10 }, () => b.next());
		expect(seqA).toEqual(seqB);
	});

	it("produces different sequences for different seeds", () => {
		const a = new SeededRandom(1);
		const b = new SeededRandom(2);
		expect(Array.from({ length: 5 }, () => a.next()))
			.not.toEqual(Array.from({ length: 5 }, () => b.next()));
	});

	it("int() stays within [0, maxInclusive]", () => {
		const rng = new SeededRandom(7);
		for (let i = 0; i < 1000; i++) {
			const v = rng.int(5);
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThanOrEqual(5);
		}
	});

	it("pick() returns a member of the list", () => {
		const rng = new SeededRandom(9);
		const items = ["a", "b", "c"] as const;
		for (let i = 0; i < 100; i++) {
			expect(items).toContain(rng.pick(items));
		}
	});
});
