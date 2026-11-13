import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameState } from "../shared/types.ts";
import { announcementEvents } from "./conductorModel.ts";
import { createConductor } from "./conductor.ts";

const state = (fuel = 100): GameState => ({
  roomCode: "TEST", phase: "playing", time: 0, players: {}, items: {}, hazards: {},
  journey: { fuel, hull: 100, distance: 0, speedFactor: 1 },
});
const fire = { id: "fire1", kind: "fire" as const, car: 0, spotId: "engine",
  position: { x: 0, y: 0 }, age: 0, progress: 0, countdown: null };

function panelHarness() {
  const panel = { textContent: "", hidden: false, style: { cssText: "" }, setAttribute() {}, remove() {} };
  vi.stubGlobal("document", { createElement: () => panel });
  const container = { append() {} } as unknown as HTMLElement;
  return { panel, container };
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("conductor", () => {
  it("announces new hazards once, including an initial active room snapshot", () => {
    const next = { ...state(), hazards: { fire1: fire } };
    expect(announcementEvents(null, next)).toEqual([{ kind: "hazard", hazard: "fire", car: 0 }]);
    expect(announcementEvents(next, next)).toEqual([]);
  });
  it("detects patches even when a room mutates its state object in place", () => {
    const { panel, container } = panelHarness();
    const conductor = createConductor(container);
    const mutable = state();
    conductor.update(mutable);
    mutable.hazards.fire1 = fire;
    conductor.update(mutable);
    expect(panel.textContent).toContain("Fire");
    mutable.journey.fuel = 20;
    conductor.update(mutable);
    expect(panel.textContent).toContain("fuel");
    conductor.dispose();
  });
  it("announces low fuel on crossing and after refuelling, never in lobby", () => {
    expect(announcementEvents(state(26), state(25))).toEqual([{ kind: "lowFuel" }]);
    expect(announcementEvents(state(25), state(24))).toEqual([]);
    expect(announcementEvents(state(40), state(20))).toHaveLength(1);
    expect(announcementEvents(null, { ...state(20), phase: "lobby" })).toEqual([]);
  });
  it("keeps warnings visible when a service fails synchronously", async () => {
    const { panel, container } = panelHarness();
    const conductor = createConductor(container, () => { throw new Error("offline"); });
    expect(() => conductor.update(state(20))).not.toThrow();
    await vi.waitFor(() => expect(panel.textContent).toContain("fuel"));
    expect(panel.hidden).toBe(false);
    conductor.dispose();
  });
  it("times out AI without losing the fallback and rejects late results", async () => {
    vi.useFakeTimers();
    const { panel, container } = panelHarness();
    let resolve!: (text: string) => void;
    const conductor = createConductor(container, () => new Promise(r => { resolve = r; }));
    conductor.update(state(20));
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(2000);
    resolve("late AI");
    await Promise.resolve();
    expect(panel.textContent).toContain("fuel");
    conductor.dispose();
  });
  it("does not let an old AI response replace a newer warning or end screen", async () => {
    const { panel, container } = panelHarness();
    let resolve!: (text: string) => void;
    const conductor = createConductor(container, () => new Promise(r => { resolve = r; }));
    conductor.update(state(20));
    await Promise.resolve();
    conductor.update({ ...state(20), hazards: { fire1: fire } });
    resolve("stale low fuel");
    await Promise.resolve();
    expect(panel.textContent).toContain("Fire");
    conductor.update({ ...state(), phase: "won" });
    expect(panel.hidden).toBe(true);
    conductor.dispose();
  });
});
