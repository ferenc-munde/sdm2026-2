import { describe, expect, it } from "vitest";
import { createLocalStateModel } from "./stateModel.ts";
import { Task } from "../shared/state.ts";
import { localStateToHud } from "./state-to-hud";

describe("local adapter to map/HUD integration", () => {
  it("presents real tasks, gauges, speed and elapsed run time without mutating state", () => {
    const model = createLocalStateModel();
    const s = model.state;
    s.tick = 140; s.runTicks = 40; s.timeLimitTicks = 6000; s.power = 42; s.pressure = 76; s.speed = 0.7;
    const task = new Task(); task.title = "Repair panel"; task.current = 1; task.target = 2;
    s.tasks.set("panel", task);
    const view = localStateToHud(s, 20);
    // The director's initial wave is present alongside the seeded task.
    expect(view.tasks.length).toBeGreaterThanOrEqual(2);
    const panelRow = view.tasks.find(row => row.id === "panel")!;
    expect(panelRow).toEqual({ id: "panel", title: "Repair panel", current: 1, target: 2, type: "POWER" });
    expect(view.gauges).toEqual({ power: 42, pressure: 76 });
    expect(view.journey.remainingSeconds).toBe(298);
    expect(view.speed).toBe(0.7);
    expect(view.journey.speed).toBe(0.7);
    panelRow.current = 2;
    expect(s.tasks.get("panel")!.current).toBe(1);
    expect(s.tick).toBe(140);
  });
  it("reads the run clock from the synced state: lobby, pause and a finished run consume no time", () => {
    const model = createLocalStateModel();
    const s = model.state;
    const remaining = () => localStateToHud(s, 20).journey.remainingSeconds;
    const steps = (count: number) => { for (let i = 0; i < count; i++) model.drainAndStep(); };
    s.phase = "lobby"; s.tick = 100; steps(40);
    expect(remaining()).toBe(300);
    s.phase = "running"; steps(20);
    expect(remaining()).toBe(299);
    s.paused = true; steps(100);
    expect(remaining()).toBe(299);
    s.paused = false; steps(20);
    expect(remaining()).toBe(298);
    s.phase = "won"; steps(100);
    expect(remaining()).toBe(298);
    s.phase = "running"; steps(1);
    expect(remaining()).toBe(299.95);
  });
  it("shows the same time to a client that starts reading in the middle of a run", () => {
    const model = createLocalStateModel();
    const s = model.state;
    for (let i = 0; i < 200; i++) model.drainAndStep();
    // A late joiner or a reconnected client has no history: it only has the synced state.
    expect(localStateToHud(s, 20).journey.remainingSeconds).toBe(290);
  });
  it("stops visual speed on pause or end, and clamps expired time", () => {
    const s = createLocalStateModel().state;
    s.speed = 1; s.paused = true;
    expect(localStateToHud(s, 20).speed).toBe(0);
    s.paused = false; s.phase = "lost"; s.runTicks = 9000;
    const view = localStateToHud(s, 20);
    expect(view.speed).toBe(0);
    expect(view.journey.phase).toBe("lost");
    expect(view.journey.remainingSeconds).toBe(0);
  });
});
