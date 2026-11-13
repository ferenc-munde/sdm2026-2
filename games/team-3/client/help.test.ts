import { afterEach, expect, it, vi } from "vitest";
import { createHelp } from "./help.ts";

class Element {
  type = ""; textContent = ""; id = ""; hidden = false; open = false;
  style = { cssText: "", marginBottom: "" };
  children: Element[] = [];
  events = new Map<string, () => void>();
  focus = vi.fn();
  setAttribute() {}
  append(...items: Element[]) { this.children.push(...items); }
  addEventListener(name: string, action: () => void) { this.events.set(name, action); }
  showModal() { this.open = true; }
  close() { this.open = false; this.events.get("close")?.(); }
  remove() {}
}
afterEach(() => vi.unstubAllGlobals());

it("resets input before opening help, and closes it when the run ends", () => {
  vi.stubGlobal("document", { createElement: () => new Element() });
  const container = new Element();
  const reset = vi.fn();
  const help = createHelp(container as unknown as HTMLElement, reset);
  const [button, dialog] = container.children;
  button!.events.get("click")!();
  expect(reset).toHaveBeenCalledOnce();
  expect(dialog!.open).toBe(true);
  help.update("lost");
  expect(dialog!.open).toBe(false);
  expect(button!.hidden).toBe(true);
  expect(button!.focus).not.toHaveBeenCalled();
  help.update("playing");
  button!.events.get("click")!();
  dialog!.close();
  expect(button!.focus).toHaveBeenCalledOnce();
});
