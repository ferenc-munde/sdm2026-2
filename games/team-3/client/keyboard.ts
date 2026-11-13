// Keyboard → input message (#11).
//
// The client only sends inputs; the server simulates movement (#7), so this file
// turns the held keys into the `input` message from `shared/messages.ts` and
// nothing else.
//
// Convention: `dy` grows towards the bottom of the screen, so the up key sends
// `dy: -1`. The movement rules (#7) must use the same convention; the renderer
// maps the floor position to the scene as (x, 0, y), so this keeps "up" up on
// screen.

import type { InputMessage } from "../shared/messages.ts";
import type { Direction } from "../shared/types.ts";

/** Which keys mean what. An action is on while any of its keys is held. */
export interface KeyBindings {
  up: readonly string[];
  down: readonly string[];
  left: readonly string[];
  right: readonly string[];
  interact: readonly string[];
}

/**
 * `event.code` values, so the layout does not matter: WASD, the arrow keys, and
 * Space or E to interact.
 */
export const DEFAULT_BINDINGS: KeyBindings = {
  up: ["KeyW", "ArrowUp"],
  down: ["KeyS", "ArrowDown"],
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  interact: ["Space", "KeyE"],
};

function isHeld(pressed: ReadonlySet<string>, codes: readonly string[]): boolean {
  return codes.some((code) => pressed.has(code));
}

/** The direction from the held keys; opposite keys cancel out. */
export function directionFromKeys(
  pressed: ReadonlySet<string>,
  bindings: KeyBindings = DEFAULT_BINDINGS,
): Direction {
  const right = isHeld(pressed, bindings.right);
  const left = isHeld(pressed, bindings.left);
  const down = isHeld(pressed, bindings.down);
  const up = isHeld(pressed, bindings.up);

  return {
    dx: right === left ? 0 : right ? 1 : -1,
    dy: down === up ? 0 : down ? 1 : -1,
  };
}

/** The whole input message for the current keys. */
export function inputFromKeys(
  pressed: ReadonlySet<string>,
  bindings: KeyBindings = DEFAULT_BINDINGS,
): InputMessage {
  return {
    type: "input",
    direction: directionFromKeys(pressed, bindings),
    interacting: isHeld(pressed, bindings.interact),
  };
}

/** True when nothing a player can press is held. */
export function isIdle(input: InputMessage): boolean {
  return input.direction.dx === 0 && input.direction.dy === 0 && !input.interacting;
}

/** True when two messages say the same thing. */
export function sameInput(a: InputMessage, b: InputMessage): boolean {
  return (
    a.direction.dx === b.direction.dx &&
    a.direction.dy === b.direction.dy &&
    a.interacting === b.interacting
  );
}

export interface KeyboardOptions {
  /** Called whenever the input changes, never twice for the same state. */
  onChange: (message: InputMessage) => void;
  /** Where the key events come from. Defaults to `window`. */
  target?: EventTarget;
  bindings?: KeyBindings;
}

export interface Keyboard {
  /** The current input, also passed to `onChange` after every change. */
  current(): InputMessage;
  /** The keys held right now, as `event.code` values. */
  readonly pressed: ReadonlySet<string>;
  /** Stops listening. */
  dispose(): void;
}

function isBound(code: string, bindings: KeyBindings): boolean {
  return [bindings.up, bindings.down, bindings.left, bindings.right, bindings.interact].some((codes) =>
    codes.includes(code),
  );
}

/**
 * Listens for the keys and reports the input message whenever it changes.
 * Keys held while the window loses focus are released, so a player is never
 * stuck moving after alt-tabbing.
 */
export function createKeyboard(options: KeyboardOptions): Keyboard {
  const bindings = options.bindings ?? DEFAULT_BINDINGS;
  const target = options.target ?? window;
  const pressed = new Set<string>();
  let current = inputFromKeys(pressed, bindings);

  const emit = (): void => {
    const next = inputFromKeys(pressed, bindings);
    if (sameInput(next, current)) return;
    current = next;
    options.onChange(next);
  };

  const onKeyDown = (event: Event): void => {
    const code = (event as KeyboardEvent).code;
    if (!isBound(code, bindings)) return;
    // Keep the page from scrolling with the arrow keys and Space.
    event.preventDefault();
    if (pressed.has(code)) return;
    pressed.add(code);
    emit();
  };

  const onKeyUp = (event: Event): void => {
    if (!pressed.delete((event as KeyboardEvent).code)) return;
    emit();
  };

  const onBlur = (): void => {
    if (pressed.size === 0) return;
    pressed.clear();
    emit();
  };

  target.addEventListener("keydown", onKeyDown);
  target.addEventListener("keyup", onKeyUp);
  target.addEventListener("blur", onBlur);

  return {
    current: () => current,
    pressed,
    dispose: () => {
      target.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("keyup", onKeyUp);
      target.removeEventListener("blur", onBlur);
      pressed.clear();
    },
  };
}

/** The message a player sends when their input changes, for the room to forward. */
export type KeyboardListener = (message: InputMessage) => void;
