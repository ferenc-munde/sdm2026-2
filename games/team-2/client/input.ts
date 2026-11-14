import type { ClientInput } from "../shared/input.ts";

interface InputAdapterOptions {
	send: (input: ClientInput) => void;
	isEnabled: () => boolean;
	isPreview: () => boolean;
	eventTarget?: EventTarget;
}

const MOVES: Record<string, readonly [number, number]> = {
	w: [0, -1],
	s: [0, 1],
	a: [-1, 0],
	d: [1, 0],
	ArrowUp: [0, -1],
	ArrowDown: [0, 1],
	ArrowLeft: [-1, 0],
	ArrowRight: [1, 0],
};

const STOPPED = "0,0,false";

function keyOf(event: KeyboardEvent): string {
	return event.key.length === 1 ? event.key.toLowerCase() : event.key;
}

function isTypingTarget(target: EventTarget | null): boolean {
	if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) return false;
	return Boolean(
		target.closest("input, select, textarea, button:not(.game-rules-control)") ||
		target.isContentEditable,
	);
}

export function createInputAdapter({
	send,
	isEnabled,
	isPreview,
	eventTarget = window,
}: InputAdapterOptions): { refreshMovement: () => void; cleanup: () => void } {
	const held = new Set<string>();
	let running = false;
	let lastMove = STOPPED;
	let cleanedUp = false;

	function sendMove(): void {
		let mx = 0;
		let my = 0;
		for (const key of held) {
			mx += MOVES[key]![0];
			my += MOVES[key]![1];
		}
		mx = Math.sign(mx);
		my = Math.sign(my);
		const run = running && (mx !== 0 || my !== 0);
		const next = `${mx},${my},${run}`;
		if (next === lastMove) return;
		lastMove = next;
		send({ type: "move", mx, my, run });
	}

	function releaseKeys(): void {
		held.clear();
		running = false;
		sendMove();
	}

	function onKeyDown(rawEvent: Event): void {
		if (!isEnabled() || isPreview()) return;
		const event = rawEvent as KeyboardEvent;
		if (isTypingTarget(event.target)) return;

		const key = keyOf(event);
		running = event.shiftKey;
		if (MOVES[key]) {
			held.add(key);
			sendMove();
			event.preventDefault();
		} else if (key === "Shift") {
			sendMove();
		} else if (event.repeat) {
			return;
		} else if (key === "f") {
			send({ type: "pickup", itemId: "wrench" });
		} else if (key === "q") {
			send({ type: "drop", itemId: "wrench" });
		}
	}

	function onKeyUp(rawEvent: Event): void {
		if (!isEnabled() || isPreview()) {
			releaseKeys();
			return;
		}
		const event = rawEvent as KeyboardEvent;
		running = event.shiftKey;
		held.delete(keyOf(event));
		sendMove();
	}

	eventTarget.addEventListener("keydown", onKeyDown);
	eventTarget.addEventListener("keyup", onKeyUp);
	eventTarget.addEventListener("blur", releaseKeys);

	return {
		refreshMovement(): void {
			if (cleanedUp) return;
			lastMove = STOPPED;
			sendMove();
		},
		cleanup(): void {
			if (cleanedUp) return;
			cleanedUp = true;
			eventTarget.removeEventListener("keydown", onKeyDown);
			eventTarget.removeEventListener("keyup", onKeyUp);
			eventTarget.removeEventListener("blur", releaseKeys);
			releaseKeys();
		},
	};
}
