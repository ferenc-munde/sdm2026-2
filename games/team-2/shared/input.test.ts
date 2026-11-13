import { describe, expect, it } from "vitest";
import { clientInputSchema } from "./input.ts";

describe("client input schema", () => {
	it("accepts a valid move input", () => {
		const parsed = clientInputSchema.parse({ type: "move", seq: 0, mx: 1, my: 0, run: false });
		expect(parsed.type).toBe("move");
	});

	it("rejects toss inputs (removed from the contract)", () => {
		expect(() => clientInputSchema.parse({ type: "toss", seq: 3, itemId: "i1", tx: 2.5, ty: -1 })).toThrow();
	});

	it("rejects a missing seq", () => {
		expect(() => clientInputSchema.parse({ type: "move", mx: 0, my: 0, run: false })).toThrow();
	});

	it("rejects a progress amount outside 1..4", () => {
		expect(() => clientInputSchema.parse({ type: "progress", seq: 0, taskId: "t", amount: 5 })).toThrow();
		expect(() => clientInputSchema.parse({ type: "progress", seq: 0, taskId: "t", amount: 0 })).toThrow();
	});

	it("rejects an unknown input type", () => {
		expect(() => clientInputSchema.parse({ type: "hack", seq: 0 })).toThrow();
	});

	it("rejects an out-of-range move vector", () => {
		expect(() => clientInputSchema.parse({ type: "move", seq: 0, mx: 2, my: 0, run: false })).toThrow();
	});
});
