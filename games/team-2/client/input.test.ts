import { afterEach, describe, expect, it, vi } from "vitest";
import { createInputAdapter } from "./input.ts";
import type { ClientInput } from "../shared/input.ts";

class FakeHTMLElement extends EventTarget {
	isContentEditable = false;

	constructor(private readonly isFormControl = false) {
		super();
	}

	closest(_selectors: string): Element | null {
		return this.isFormControl ? (this as unknown as Element) : null;
	}
}

function keyboardEvent(
	type: "keydown" | "keyup",
	key: string,
	options: { shiftKey?: boolean; repeat?: boolean } = {},
): KeyboardEvent {
	const event = new Event(type, { cancelable: true });
	Object.defineProperties(event, {
		key: { value: key },
		shiftKey: { value: options.shiftKey ?? false },
		repeat: { value: options.repeat ?? false },
	});
	return event as KeyboardEvent;
}

function dispatchKey(
	target: EventTarget,
	type: "keydown" | "keyup",
	key: string,
	options: { shiftKey?: boolean; repeat?: boolean } = {},
): KeyboardEvent {
	const event = keyboardEvent(type, key, options);
	target.dispatchEvent(event);
	return event;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("client input adapter", () => {
	it("maps every WASD and arrow direction", () => {
		const mappings = [
			["w", 0, -1],
			["s", 0, 1],
			["a", -1, 0],
			["d", 1, 0],
			["ArrowUp", 0, -1],
			["ArrowDown", 0, 1],
			["ArrowLeft", -1, 0],
			["ArrowRight", 1, 0],
		] as const;

		for (const [key, mx, my] of mappings) {
			const target = new EventTarget();
			const send = vi.fn<(input: ClientInput) => void>();
			createInputAdapter({ send, isEnabled: () => true, isPreview: () => false, eventTarget: target });
			dispatchKey(target, "keydown", key);
			expect(send).toHaveBeenCalledWith({ type: "move", mx, my, run: false });
		}
	});

	it("sends deduplicated WASD and arrow movement and releases each key", () => {
		const target = new EventTarget();
		const send = vi.fn<(input: ClientInput) => void>();
		createInputAdapter({ send, isEnabled: () => true, isPreview: () => false, eventTarget: target });

		const firstMove = dispatchKey(target, "keydown", "w");
		expect(firstMove.defaultPrevented).toBe(true);
		dispatchKey(target, "keydown", "w", { repeat: true });
		dispatchKey(target, "keydown", "ArrowRight");
		dispatchKey(target, "keyup", "w");
		dispatchKey(target, "keyup", "ArrowRight");

		expect(send.mock.calls.map(([input]) => input)).toEqual([
			{ type: "move", mx: 0, my: -1, run: false },
			{ type: "move", mx: 1, my: -1, run: false },
			{ type: "move", mx: 1, my: 0, run: false },
			{ type: "move", mx: 0, my: 0, run: false },
		]);
	});

	it("applies Shift to movement and updates when Shift is released", () => {
		const target = new EventTarget();
		const send = vi.fn<(input: ClientInput) => void>();
		createInputAdapter({ send, isEnabled: () => true, isPreview: () => false, eventTarget: target });

		dispatchKey(target, "keydown", "d");
		dispatchKey(target, "keydown", "Shift", { shiftKey: true });
		dispatchKey(target, "keyup", "Shift");
		dispatchKey(target, "keyup", "d");

		expect(send.mock.calls.map(([input]) => input)).toEqual([
			{ type: "move", mx: 1, my: 0, run: false },
			{ type: "move", mx: 1, my: 0, run: true },
			{ type: "move", mx: 1, my: 0, run: false },
			{ type: "move", mx: 0, my: 0, run: false },
		]);
	});

	it("sends pickup and drop for the wrench and ignores repeated actions", () => {
		const target = new EventTarget();
		const send = vi.fn<(input: ClientInput) => void>();
		createInputAdapter({ send, isEnabled: () => true, isPreview: () => false, eventTarget: target });

		dispatchKey(target, "keydown", "f");
		dispatchKey(target, "keydown", "f", { repeat: true });
		dispatchKey(target, "keydown", "q");
		dispatchKey(target, "keydown", "q", { repeat: true });

		expect(send.mock.calls.map(([input]) => input)).toEqual([
			{ type: "pickup", itemId: "wrench" },
			{ type: "drop", itemId: "wrench" },
		]);
	});

	it("ignores input when disabled, in preview, or typing in a form control", () => {
		vi.stubGlobal("HTMLElement", FakeHTMLElement);
		const target = new EventTarget();
		const inputTarget = new FakeHTMLElement(true);
		const send = vi.fn<(input: ClientInput) => void>();
		let enabled = false;
		let preview = false;
		createInputAdapter({
			send,
			isEnabled: () => enabled,
			isPreview: () => preview,
			eventTarget: target,
		});

		dispatchKey(target, "keydown", "w");
		enabled = true;
		preview = true;
		dispatchKey(target, "keydown", "f");
		preview = false;
		dispatchKey(inputTarget, "keydown", "q");

		expect(send).not.toHaveBeenCalled();
	});

	it("releases movement on window blur", () => {
		const target = new EventTarget();
		const send = vi.fn<(input: ClientInput) => void>();
		createInputAdapter({ send, isEnabled: () => true, isPreview: () => false, eventTarget: target });
		dispatchKey(target, "keydown", "a");

		target.dispatchEvent(new Event("blur"));

		expect(send.mock.calls.map(([input]) => input)).toEqual([
			{ type: "move", mx: -1, my: 0, run: false },
			{ type: "move", mx: 0, my: 0, run: false },
		]);
	});

	it("resends the current movement through the active session callback", () => {
		const target = new EventTarget();
		const offlineSend = vi.fn<(input: ClientInput) => void>();
		const onlineSend = vi.fn<(input: ClientInput) => void>();
		let activeSend = offlineSend;
		const adapter = createInputAdapter({
			send: (input) => activeSend(input),
			isEnabled: () => true,
			isPreview: () => false,
			eventTarget: target,
		});
		dispatchKey(target, "keydown", "w");

		activeSend = onlineSend;
		adapter.refreshMovement();
		adapter.cleanup();

		expect(offlineSend.mock.calls.map(([input]) => input)).toEqual([
			{ type: "move", mx: 0, my: -1, run: false },
		]);
		expect(onlineSend.mock.calls.map(([input]) => input)).toEqual([
			{ type: "move", mx: 0, my: -1, run: false },
			{ type: "move", mx: 0, my: 0, run: false },
		]);
	});

	it("removes listeners and releases held movement on cleanup", () => {
		const target = new EventTarget();
		const send = vi.fn<(input: ClientInput) => void>();
		const adapter = createInputAdapter({
			send,
			isEnabled: () => true,
			isPreview: () => false,
			eventTarget: target,
		});
		dispatchKey(target, "keydown", "ArrowUp");

		adapter.cleanup();
		dispatchKey(target, "keydown", "d");
		adapter.cleanup();

		expect(send.mock.calls.map(([input]) => input)).toEqual([
			{ type: "move", mx: 0, my: -1, run: false },
			{ type: "move", mx: 0, my: 0, run: false },
		]);
	});

	it("releases movement and ignores gameplay actions after a terminal phase", () => {
		const target = new EventTarget();
		const send = vi.fn<(input: ClientInput) => void>();
		let phase: "running" | "won" = "running";
		const adapter = createInputAdapter({
			send,
			isEnabled: () => phase === "running",
			isPreview: () => false,
			eventTarget: target,
		});
		dispatchKey(target, "keydown", "w");

		phase = "won";
		adapter.cleanup();
		dispatchKey(target, "keydown", "f");
		dispatchKey(target, "keydown", "q");

		expect(send.mock.calls.map(([input]) => input)).toEqual([
			{ type: "move", mx: 0, my: -1, run: false },
			{ type: "move", mx: 0, my: 0, run: false },
		]);
	});
});
