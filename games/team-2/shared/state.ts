import { Schema, MapSchema, type } from "@colyseus/schema";
import { BaseState } from "@sdm/core/sim";

export type TaskType = "POWER" | "PRESSURE" | "FIRE" | "NAVIGATION" | "CARGO";

export class Player extends Schema {
	@type("string") name: string = "";
	@type("uint8") carIndex: number = 0;
	@type("float32") x: number = 0;
	@type("float32") y: number = 0;
	@type("string") anim: string = "idle";
	@type("string") holdingItemId: string = "";
	@type("boolean") eliminated: boolean = false;
}

export class Task extends Schema {
	@type("string") title: string = "";
	@type("uint8") current: number = 0;
	@type("uint8") target: number = 1;
	@type("string") type: string = "POWER";
	@type("string") minigame: string = "wires";
	@type("uint8") stepCount: number = 1;
	@type("uint8") stepIndex: number = 0;
}

export class Hazard extends Schema {
	@type("string") type: string = "";
	@type("uint8") carIndex: number = 0;
	@type("float32") x: number = 0;
	@type("float32") y: number = 0;
	@type("float32") progress: number = 0;
}

export class Item extends Schema {
	@type("string") type: string = "";
	@type("string") holderId: string = "";
	@type("float32") x: number = 0;
	@type("float32") y: number = 0;
	@type("float32") fuel: number = 0;
}

export class DoorState extends Schema {
	@type("uint8") carIndex: number = 0;
	@type("boolean") locked: boolean = false;
	@type("uint16") lockRemainTicks: number = 0;
}

export class LastTrainState extends BaseState {
	@type("string") phase: string = "lobby";
	@type("float32") journeyDistance: number = 0;
	@type("float32") speed: number = 0;
	@type("uint16") timeLimitTicks: number = 0;
	/**
	 * Ticks played in the current run. Written only by the rules (`step` in game.ts): it rises by one
	 * per tick while `phase` is "running" and starts again at 0 when a run starts. The room does not
	 * step while paused, so paused time is not counted. Clients read the run clock from here and never
	 * count ticks themselves, so every player sees the same time, also after joining late or reconnecting.
	 */
	@type("uint32") runTicks: number = 0;
	@type("float32") power: number = 100;
	@type("float32") pressure: number = 0;
	@type("boolean") endgameUnlocked: boolean = false;
	@type({ map: Player }) players = new MapSchema<Player>();
	@type({ map: Task }) tasks = new MapSchema<Task>();
	@type({ map: Hazard }) hazards = new MapSchema<Hazard>();
	@type({ map: Item }) items = new MapSchema<Item>();
	@type({ map: DoorState }) doors = new MapSchema<DoorState>();
}
