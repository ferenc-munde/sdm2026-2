import configJson from "../config/game.json";
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
	it("accepts the shipped config/game.json", () => {
		expect(parseGameConfig(configJson)).toMatchObject(valid);
	});

	it("has movement speeds, with defaults when the file leaves them out", () => {
		expect(parseGameConfig(configJson)).toMatchObject({ walkSpeed: 120, runSpeed: 200 });
		expect(parseGameConfig(valid)).toMatchObject({ walkSpeed: 120, runSpeed: 200 });
		expect(() => parseGameConfig({ ...valid, walkSpeed: 0 })).toThrow();
	});

	it("rejects an out-of-range tickRate", () => {
		expect(() => parseGameConfig({ ...valid, tickRate: 5 })).toThrow();
		expect(() => parseGameConfig({ ...valid, tickRate: 61 })).toThrow();
	});

	it("rejects too many players", () => {
		expect(() => parseGameConfig({ ...valid, maxPlayers: 5 })).toThrow();
	});

	it("rejects a missing time limit", () => {
		const { timeLimitSeconds: _omit, ...rest } = valid;
		expect(() => parseGameConfig(rest)).toThrow();
	});

	it("rejects an out-of-range timeLimitSeconds", () => {
		expect(() => parseGameConfig({ ...valid, timeLimitSeconds: 30 })).toThrow();
		expect(() => parseGameConfig({ ...valid, timeLimitSeconds: 2000 })).toThrow();
		expect(() => parseGameConfig({ ...valid, timeLimitSeconds: 120.5 })).toThrow();
	});

	it("rejects a patchRate above the tickRate", () => {
		expect(() => parseGameConfig({ ...valid, tickRate: 20, patchRate: 21 })).toThrow();
	});

	it("accepts a patchRate equal to the tickRate", () => {
		expect(() => parseGameConfig({ ...valid, tickRate: 20, patchRate: 20 })).not.toThrow();
	});

	it("rejects a tick budget exceeding the uint16 limit", () => {
		expect(() => parseGameConfig({ ...valid, tickRate: 60, timeLimitSeconds: 1200 })).toThrow();
		expect(() => parseGameConfig({ ...valid, tickRate: 60, timeLimitSeconds: 1100 })).toThrow();
		expect(() => parseGameConfig({ ...valid, tickRate: 60, timeLimitSeconds: 1092 })).not.toThrow();
		expect(() => parseGameConfig({ ...valid, tickRate: 50, timeLimitSeconds: 1200 })).not.toThrow();
	});
});
