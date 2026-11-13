import { describe, expect, it } from "vitest";
import {
  DEFAULT_BINDINGS,
  createKeyboard,
  directionFromKeys,
  inputFromKeys,
  isIdle,
  sameInput,
  type Keyboard,
} from "./keyboard.ts";

const keys = (...codes: string[]): Set<string> => new Set(codes);

/** A key event good enough for the listener: a plain Event with a `code`. */
function keyEvent(type: "keydown" | "keyup", code: string): Event {
  const event = new Event(type, { cancelable: true });
  Object.defineProperty(event, "code", { value: code });
  return event;
}

function press(target: EventTarget, code: string): void {
  target.dispatchEvent(keyEvent("keydown", code));
}

function release(target: EventTarget, code: string): void {
  target.dispatchEvent(keyEvent("keyup", code));
}

function listen(target?: EventTarget, seen: string[] = []): { keyboard: Keyboard; seen: string[] } {
  const keyboard = createKeyboard({
    target,
    onChange: (message) => seen.push(`${message.direction.dx},${message.direction.dy},${message.interacting}`),
  });
  return { keyboard, seen };
}

describe("direction from keys", () => {
  it("maps WASD and the arrow keys to the same directions", () => {
    expect(directionFromKeys(keys("KeyW"))).toEqual({ dx: 0, dy: -1 });
    expect(directionFromKeys(keys("ArrowUp"))).toEqual({ dx: 0, dy: -1 });
    expect(directionFromKeys(keys("KeyS"))).toEqual({ dx: 0, dy: 1 });
    expect(directionFromKeys(keys("ArrowDown"))).toEqual({ dx: 0, dy: 1 });
    expect(directionFromKeys(keys("KeyA"))).toEqual({ dx: -1, dy: 0 });
    expect(directionFromKeys(keys("ArrowLeft"))).toEqual({ dx: -1, dy: 0 });
    expect(directionFromKeys(keys("KeyD"))).toEqual({ dx: 1, dy: 0 });
    expect(directionFromKeys(keys("ArrowRight"))).toEqual({ dx: 1, dy: 0 });
  });

  it("mixes the two sets and allows diagonals", () => {
    expect(directionFromKeys(keys("KeyW", "ArrowRight"))).toEqual({ dx: 1, dy: -1 });
    expect(directionFromKeys(keys("KeyA", "KeyS"))).toEqual({ dx: -1, dy: 1 });
  });

  it("cancels opposite keys", () => {
    expect(directionFromKeys(keys("KeyA", "KeyD"))).toEqual({ dx: 0, dy: 0 });
    expect(directionFromKeys(keys("ArrowUp", "KeyS"))).toEqual({ dx: 0, dy: 0 });
  });

  it("ignores keys that are not bound", () => {
    expect(directionFromKeys(keys("KeyQ", "ShiftLeft"))).toEqual({ dx: 0, dy: 0 });
  });

  it("accepts custom bindings", () => {
    const bindings = { ...DEFAULT_BINDINGS, up: ["KeyI"], interact: ["KeyF"] };
    expect(directionFromKeys(keys("KeyI"), bindings)).toEqual({ dx: 0, dy: -1 });
    expect(inputFromKeys(keys("KeyF"), bindings).interacting).toBe(true);
    // The default up keys are no longer bound.
    expect(directionFromKeys(keys("KeyW"), bindings)).toEqual({ dx: 0, dy: 0 });
  });
});

describe("input message", () => {
  it("has the shape the room expects", () => {
    expect(inputFromKeys(keys("KeyD", "ArrowUp"))).toEqual({
      type: "input",
      direction: { dx: 1, dy: -1 },
      interacting: false,
    });
  });

  it("sends interact while Space or E is held", () => {
    expect(inputFromKeys(keys("Space")).interacting).toBe(true);
    expect(inputFromKeys(keys("KeyE")).interacting).toBe(true);
    expect(inputFromKeys(keys("KeyE", "KeyD")).interacting).toBe(true);
    expect(inputFromKeys(keys("KeyD")).interacting).toBe(false);
  });

  it("is idle only when nothing is held", () => {
    expect(isIdle(inputFromKeys(keys()))).toBe(true);
    expect(isIdle(inputFromKeys(keys("KeyD")))).toBe(false);
    expect(isIdle(inputFromKeys(keys("Space")))).toBe(false);
  });

  it("compares messages by what they say", () => {
    const a = inputFromKeys(keys("KeyW"));
    expect(sameInput(a, inputFromKeys(keys("ArrowUp")))).toBe(true);
    expect(sameInput(a, inputFromKeys(keys("KeyW", "Space")))).toBe(false);
    expect(sameInput(a, inputFromKeys(keys("KeyS")))).toBe(false);
  });
});

describe("keyboard listener", () => {
  it("reports a message on the first key and on every change, not on repeats", () => {
    const target = new EventTarget();
    const { keyboard, seen } = listen(target);

    press(target, "KeyD");
    press(target, "KeyD"); // auto-repeat from the OS
    expect(seen).toEqual(["1,0,false"]);
    expect(keyboard.current().direction).toEqual({ dx: 1, dy: 0 });

    press(target, "Space");
    expect(seen).toEqual(["1,0,false", "1,0,true"]);

    release(target, "KeyD");
    release(target, "Space");
    expect(seen).toEqual(["1,0,false", "1,0,true", "0,0,true", "0,0,false"]);
    expect(keyboard.current().direction).toEqual({ dx: 0, dy: 0 });
  });

  it("does not report anything for unbound keys", () => {
    const target = new EventTarget();
    const { seen } = listen(target);
    press(target, "KeyQ");
    release(target, "KeyQ");
    expect(seen).toEqual([]);
  });

  it("stops the page from scrolling on the bound keys only", () => {
    const target = new EventTarget();
    listen(target);

    const arrow = keyEvent("keydown", "ArrowDown");
    target.dispatchEvent(arrow);
    expect(arrow.defaultPrevented).toBe(true);

    const other = keyEvent("keydown", "KeyQ");
    target.dispatchEvent(other);
    expect(other.defaultPrevented).toBe(false);
  });

  it("releases every key when the window loses focus", () => {
    const target = new EventTarget();
    const { keyboard, seen } = listen(target);
    press(target, "KeyW");
    press(target, "KeyD");
    expect(keyboard.current().direction).toEqual({ dx: 1, dy: -1 });

    target.dispatchEvent(new Event("blur"));
    expect(keyboard.current().direction).toEqual({ dx: 0, dy: 0 });
    expect(keyboard.current().interacting).toBe(false);
    expect(seen.at(-1)).toBe("0,0,false");
  });

  it("ignores everything after dispose", () => {
    const target = new EventTarget();
    const { keyboard, seen } = listen(target);
    press(target, "KeyW");
    keyboard.dispose();
    press(target, "KeyD");
    release(target, "KeyW");
    expect(seen).toEqual(["0,-1,false"]);
    expect(keyboard.pressed.size).toBe(0);
  });

  it("does not report a change when a held direction is replaced by its twin", () => {
    const target = new EventTarget();
    const { seen } = listen(target);
    press(target, "KeyW");
    press(target, "ArrowUp");
    release(target, "KeyW");
    // Still up the whole time: one message, not three.
    expect(seen).toEqual(["0,-1,false"]);
  });
});
