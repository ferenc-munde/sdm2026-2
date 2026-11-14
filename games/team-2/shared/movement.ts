import { carIndexAt, contains, spawnPoint, WALKABLE } from "./map.ts";
import type { LastTrainState, Player } from "./state.ts";

export interface MovementConfig {
	tickRate: number;
	/** Map units per second. */
	walkSpeed: number;
	runSpeed: number;
}

export interface MoveIntent {
	mx: number;
	my: number;
	run: boolean;
}

export interface MovementModule {
	/** Remember what the player is holding down; it applies every tick until it changes. */
	setIntent(playerId: string, intent: MoveIntent): void;
	/** Stop a player (they left or their connection dropped). */
	clear(playerId: string): void;
	tick(): void;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** Put a joining player on a free-looking spot; `slot` is how many players were there before. */
export function placeAtSpawn(player: Player, slot: number): void {
	const spawn = spawnPoint(slot);
	player.carIndex = spawn.carIndex;
	player.x = spawn.x;
	player.y = spawn.y;
}

/**
 * Move a player by (dx, dy) map units, kept inside the walkable area. The target is clamped into
 * each rectangle the player stands in and the closest result wins, so players slide along walls
 * and cross from a carriage into a passage where the two overlap.
 */
export function movePlayer(player: Player, dx: number, dy: number): void {
	const targetX = player.x + dx;
	const targetY = player.y + dy;
	let bestX = player.x;
	let bestY = player.y;
	let bestDistance = Number.POSITIVE_INFINITY;
	for (const rect of WALKABLE) {
		if (!contains(rect, player.x, player.y)) continue;
		const x = clamp(targetX, rect.x, rect.x + rect.width);
		const y = clamp(targetY, rect.y, rect.y + rect.height);
		const distance = Math.hypot(targetX - x, targetY - y);
		if (distance < bestDistance) {
			bestDistance = distance;
			bestX = x;
			bestY = y;
		}
	}
	if (bestDistance === Number.POSITIVE_INFINITY) {
		// Outside the train (should not happen): put the player back on board.
		placeAtSpawn(player, 0);
		return;
	}
	player.x = bestX;
	player.y = bestY;
	const car = carIndexAt(bestX, bestY);
	if (car >= 0) player.carIndex = car;
}

export function createMovement(state: LastTrainState, config: MovementConfig): MovementModule {
	const intents = new Map<string, MoveIntent>();
	return {
		setIntent(playerId, intent) {
			if (intent.mx === 0 && intent.my === 0) intents.delete(playerId);
			else intents.set(playerId, intent);
		},
		clear(playerId) {
			intents.delete(playerId);
		},
		tick() {
			for (const [playerId, intent] of intents) {
				const player = state.players.get(playerId);
				if (!player || player.eliminated) {
					if (player) player.anim = "idle";
					intents.delete(playerId);
					continue;
				}
				// Diagonals are not faster than straight lines.
				const length = Math.max(1, Math.hypot(intent.mx, intent.my));
				const distance = (intent.run ? config.runSpeed : config.walkSpeed) / config.tickRate;
				movePlayer(player, (intent.mx / length) * distance, (intent.my / length) * distance);
			}
			for (const [playerId, player] of state.players) {
				const intent = intents.get(playerId);
				const anim = intent ? (intent.run ? "run" : "walk") : "idle";
				if (player.anim !== anim) player.anim = anim;
			}
		},
	};
}
