import { describe, expect, it } from "vitest";
import type { ClientMessage } from "../shared/messages.ts";
import { createActionKeys, TAP_MS } from "./actionKeys.ts";

const setup = () => {
  const sent: ClientMessage["type"][] = [];
  return { sent, on: createActionKeys((m) => sent.push(m.type)) };
};

describe("action keys", () => {
  it("a tap of E picks up or drops; holding E does not", () => {
    const { sent, on } = setup();
    on({ kind: "keydown", code: "KeyE", repeat: false, time: 0 });
    on({ kind: "keyup", code: "KeyE", time: TAP_MS - 1 });
    expect(sent).toEqual(["pickUpOrDrop"]);
    on({ kind: "keydown", code: "KeyE", repeat: false, time: 1000 });
    on({ kind: "keydown", code: "KeyE", repeat: true, time: 1100 });
    on({ kind: "keyup", code: "KeyE", time: 1000 + TAP_MS + 500 });
    expect(sent).toEqual(["pickUpOrDrop"]);
  });

  it("Shift or F throws, once per press", () => {
    const { sent, on } = setup();
    on({ kind: "keydown", code: "ShiftLeft", repeat: false, time: 0 });
    on({ kind: "keydown", code: "ShiftLeft", repeat: true, time: 50 });
    on({ kind: "keydown", code: "KeyF", repeat: false, time: 100 });
    expect(sent).toEqual(["throw", "throw"]);
  });

  it("a left click picks up or drops; other buttons do nothing", () => {
    const { sent, on } = setup();
    on({ kind: "click", button: 0 });
    on({ kind: "click", button: 2 });
    expect(sent).toEqual(["pickUpOrDrop"]);
  });
});
