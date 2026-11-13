/**
 * Local shim of the platform contract (`@sdm/core/sim`), until `@sdm/core`
 * lands (tracked in #73). The shapes mirror `server/ARCHITECTURE.md`; when the
 * package exists these types are replaced by imports from `@sdm/core/sim` and
 * `@sdm/core/shared` — no other file changes.
 */
import { Schema, MapSchema, type } from "@colyseus/schema";
import type { ClientInput } from "./input.ts";

/** Validated client input (see shared/input.ts). The server applies, never trusts. */
export type { ClientInput };

/** Deterministic random generator passed into all rules code. Never Math.random. */
export interface Rng {
	next(): number;
	int(maxInclusive: number): number;
	pick<T>(items: readonly T[]): T;
}

export class Seat extends Schema {
	@type("boolean") connected: boolean = true;
	@type("uint32") lastSeq: number = 0;
}

/** Fields owned by the room shell (see server/ARCHITECTURE.md, BaseState). */
export abstract class BaseState extends Schema {
	@type("uint32") tick: number = 0;
	@type("string") code: string = "";
	@type("boolean") paused: boolean = false;
	@type({ map: Seat }) seats = new MapSchema<Seat>();
}

/**
 * Pure game rules. `step` runs once per fixed tick; everything inside must be
 * deterministic (rng + state in, state out — no wall clock).
 */
export interface GameDefinition<S extends BaseState> {
	createState: () => S;
	init: (state: S, rng: Rng, config: unknown) => void;
	join: (state: S, sessionId: string, opts: { name?: string }) => void;
	leave: (state: S, sessionId: string) => void;
	step: (state: S, inputs: ClientInput[], dt: number, rng: Rng, config: unknown) => void;
	commands?: Record<string, (state: S, args: Record<string, unknown>, rng: Rng) => void>;
}
