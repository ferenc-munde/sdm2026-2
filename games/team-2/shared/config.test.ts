import { describe, expect, it } from "vitest";
import { parseGameConfig } from "./config.ts";

const valid = {
	tickRate: 20,
	patchRate: 20,
	maxPlayers: 4,
	reconnectSeconds: 30,
	timeLimitSeconds: 300,
};

describe("game config", () => {
	it("accepts the shipped config", () => {
		expect(parseGameConfig(valid)).toMatchObject(valid);
	});

	it("rejects an out-of-range tickRate", () => {
		expect(() => parseGameConfig({ ...valid, tickRate: 5 })).toThrow();
	});

	it("rejects too many players", () => {
		expect(() => parseGameConfig({ ...valid, maxPlayers: 5 })).toThrow();
	});

	it("rejects a missing time limit", () => {
		const { timeLimitSeconds: _omit, ...rest } = valid;
		expect(() => parseGameConfig(rest)).toThrow();
	});
});
