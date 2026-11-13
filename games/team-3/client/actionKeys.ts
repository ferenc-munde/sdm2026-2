// The action keys from the design (#220, idea document section 3):
// - E: tap to pick up or drop (also takes or delivers coal and pulls the lever); hold to interact.
//   Holding E is already "interact" in the keyboard bindings; a short press is also a pick-up.
// - Shift or F: throw the held item.
// - Left click: pick up or drop.
import type { ClientMessage } from "../shared/messages.ts";

/** A press of E shorter than this is a tap (pick up / drop), longer is a hold (interact). */
export const TAP_MS = 250;

export type ActionEvent =
  | { kind: "keydown"; code: string; repeat: boolean; time: number }
  | { kind: "keyup"; code: string; time: number }
  | { kind: "click"; button: number };

/** Turns key and mouse events into the one-shot messages they send; holds are left to the keyboard. */
export function createActionKeys(send: (message: ClientMessage) => void): (event: ActionEvent) => void {
  let ePressedAt: number | null = null;
  return (event) => {
    if (event.kind === "click") {
      if (event.button === 0) send({ type: "pickUpOrDrop" });
      return;
    }
    if (event.kind === "keydown") {
      if (event.repeat) return;
      if (event.code === "KeyE") ePressedAt = event.time;
      else if (event.code === "ShiftLeft" || event.code === "ShiftRight" || event.code === "KeyF") send({ type: "throw" });
      return;
    }
    if (event.code === "KeyE" && ePressedAt !== null) {
      if (event.time - ePressedAt < TAP_MS) send({ type: "pickUpOrDrop" });
      ePressedAt = null;
    }
  };
}
