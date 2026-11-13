import { describe, expect, it } from "vitest";
import { clientInputSchema, joinOptionsSchema } from "./input.ts";

describe("client input schema", () => {
	it("accepts a valid move input", () => {
		const parsed = clientInputSchema.parse({ type: "move", mx: 1, my: 0, run: false });
		expect(parsed.type).toBe("move");
	});

	it("rejects toss inputs (removed from the contract)", () => {
		expect(() => clientInputSchema.parse({ type: "toss", itemId: "i1", tx: 2.5, ty: -1 })).toThrow();
	});

	it("needs no seq: the platform envelope carries it, a stray one is stripped", () => {
		expect(clientInputSchema.parse({ type: "move", seq: 7, mx: 0, my: 0, run: false })).toEqual({ type: "move", mx: 0, my: 0, run: false });
		expect(clientInputSchema.parse({ type: "startRun" })).toEqual({ type: "startRun" });
	});

	it("join options: a trimmed name of 1 to 16 characters, or none", () => {
		expect(joinOptionsSchema.parse({ name: "  Ada " })).toEqual({ name: "Ada" });
		expect(joinOptionsSchema.parse({})).toEqual({});
		expect(joinOptionsSchema.safeParse({ name: "   " }).success).toBe(false);
		expect(joinOptionsSchema.safeParse({ name: "x".repeat(17) }).success).toBe(false);
	});

	it("rejects a progress amount outside 1..4", () => {
		expect(() => clientInputSchema.parse({ type: "progress", taskId: "t", amount: 5 })).toThrow();
		expect(() => clientInputSchema.parse({ type: "progress", taskId: "t", amount: 0 })).toThrow();
	});

	it("rejects an unknown input type", () => {
		expect(() => clientInputSchema.parse({ type: "hack" })).toThrow();
	});

	it("rejects an out-of-range move vector", () => {
		expect(() => clientInputSchema.parse({ type: "move", mx: 2, my: 0, run: false })).toThrow();
	});
});
