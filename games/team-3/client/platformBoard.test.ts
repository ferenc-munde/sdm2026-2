import { afterEach, expect, it, vi } from "vitest";
import { makeState } from "../shared/run/testState.ts";
import { createPlatformMap } from "../shared/map/platform.ts";
import { createPlatformBoard } from "./platformBoard.ts";

class Element {
  textContent = "";
  hidden = false;
  style = { cssText: "" };
  children: Element[] = [];
  attributes = new Map<string, string>();
  removed = false;
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  append(...items: Element[]) { this.children.push(...items); }
  remove() { this.removed = true; }
}

afterEach(() => vi.unstubAllGlobals());

it("shows instructions only while the player is near a platform board", () => {
  vi.stubGlobal("document", { createElement: () => new Element() });
  const container = new Element();
  const map = createPlatformMap();
  const state = makeState({ phase: "lobby" }, ["p1"]);
  const board = createPlatformBoard(container as unknown as HTMLElement);
  const panel = container.children[0]!;

  board.update(state, "p1", map.objects);
  expect(panel.hidden).toBe(true);

  const nearby = {
    ...state,
    players: {
      ...state.players,
      p1: { ...state.players.p1!, position: { ...map.objects.boards[0]! } },
    },
  };
  board.update(nearby, "p1", map.objects);
  expect(panel.hidden).toBe(false);
  expect(panel.attributes.get("aria-label")).toBe("Platform how-to-play board");

  board.hide();
  expect(panel.hidden).toBe(true);
  board.dispose();
  expect(panel.removed).toBe(true);
});
