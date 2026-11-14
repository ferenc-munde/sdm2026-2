import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHud, type HudJourney } from "./hud";

type TestNode = TestElement | { textContent: string };

class TestElement {
  className = "";
  hidden = false;
  title = "";
  value = 0;
  max = 0;
  type = "";
  style: Record<string, unknown> & {
    setProperty: (name: string, value: string) => void;
    getPropertyValue: (name: string) => string;
    removeProperty: (name: string) => void;
  };
  children: TestNode[] = [];
  attributes = new Map<string, string>();
  private listeners = new Map<string, Array<() => void>>();
  private content: string | null = null;
  readonly classList = {
    contains: (name: string) => this.className.split(/\s+/).includes(name),
    toggle: (name: string, force?: boolean) => {
      const classes = new Set(this.className.split(/\s+/).filter(Boolean));
      const enabled = force ?? !classes.has(name);
      if (enabled) classes.add(name);
      else classes.delete(name);
      this.className = [...classes].join(" ");
      return enabled;
    },
  };

  constructor(readonly tagName: string) {
    const properties = new Map<string, string>();
    this.style = {
      setProperty: (name, value) => properties.set(name, value),
      getPropertyValue: name => properties.get(name) ?? "",
      removeProperty: name => properties.delete(name),
    };
  }

  get textContent(): string {
    return this.content ?? this.children.map(child => child.textContent).join("");
  }

  set textContent(value: string) {
    this.content = value;
    this.children = [];
  }

  append(...nodes: TestNode[]): void {
    this.content = null;
    this.children.push(...nodes);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  addEventListener(type: string, listener: () => void): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  click(): void {
    for (const listener of this.listeners.get("click") ?? []) listener();
  }

  remove(): void {}

  getBoundingClientRect(): { bottom: number } {
    return { bottom: 100 };
  }
}

function findElement(root: TestElement, predicate: (element: TestElement) => boolean): TestElement | undefined {
  if (predicate(root)) return root;
  for (const child of root.children) {
    if (child instanceof TestElement) {
      const found = findElement(child, predicate);
      if (found) return found;
    }
  }
  return undefined;
}

const journey = (phase: HudJourney["phase"]): HudJourney => ({
  distance: 0.6,
  remainingSeconds: 100,
  totalSeconds: 300,
  phase,
});

describe("result HUD", () => {
  let container: TestElement;

  beforeEach(() => {
    container = new TestElement("div");
    const documentElement = new TestElement("html");
    vi.stubGlobal("document", {
      createElement: (tagName: string) => new TestElement(tagName),
      createTextNode: (textContent: string) => ({ textContent }),
      documentElement,
    });
    vi.stubGlobal("ResizeObserver", class {
      observe(): void {}
      disconnect(): void {}
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the requested victory message and a visible lobby button", () => {
    const hud = createHud(container as unknown as HTMLElement);
    hud.updateJourney(journey("won"));
    const result = findElement(container, element => element.classList.contains("train-result"))!;
    const title = findElement(result, element => element.tagName === "h1")!;
    const message = findElement(result, element => element.tagName === "p")!;
    const button = findElement(result, element => element.tagName === "button")!;

    expect(result.hidden).toBe(false);
    expect(title.textContent).toBe("Congratulations!");
    expect(message.textContent).toBe("Your crew made it! The train arrived safely.");
    expect(button.textContent).toBe("Return to Lobby");
    hud.destroy();
  });

  it("shows the requested defeat message", () => {
    const hud = createHud(container as unknown as HTMLElement);
    hud.updateJourney(journey("lost"));
    const result = findElement(container, element => element.classList.contains("train-result"))!;

    expect(result.hidden).toBe(false);
    expect(findElement(result, element => element.tagName === "h1")!.textContent).toBe("Better Luck Next Time!");
    expect(findElement(result, element => element.tagName === "p")!.textContent).toBe("The journey is over. Don't give up, crew!");
    hud.destroy();
  });

  it("keeps the result hidden during lobby and running, and invokes the optional callback", () => {
    const onReturnToLobby = vi.fn();
    const hud = createHud(container as unknown as HTMLElement, onReturnToLobby);
    const result = findElement(container, element => element.classList.contains("train-result"))!;
    const button = findElement(result, element => element.tagName === "button")!;

    for (const phase of ["lobby", "running"] as const) {
      hud.updateJourney(journey(phase));
      expect(result.hidden).toBe(true);
    }
    hud.updateJourney(journey("won"));
    expect(result.hidden).toBe(false);
    button.click();
    expect(onReturnToLobby).toHaveBeenCalledOnce();
    hud.destroy();
  });
});
