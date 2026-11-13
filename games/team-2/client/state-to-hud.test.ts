import { describe, expect, it } from "vitest";
import { createLocalStateModel } from "./stateModel.ts";
import { Task } from "../shared/state.ts";
import { localStateToHud, createHudStateReader } from "./state-to-hud";

describe("local adapter to map/HUD integration", () => {
  it("presents real tasks, gauges, speed and elapsed run time without mutating state", () => {
    const model = createLocalStateModel();
    const s = model.state;
    s.tick = 140; s.timeLimitTicks = 6000; s.power = 42; s.pressure = 76; s.speed = 0.7;
    const task = new Task(); task.title = "Repair panel"; task.current = 1; task.target = 2;
    s.tasks.set("panel", task);
    const view = localStateToHud(s, 20, 100);
    expect(view.tasks).toEqual([{ id: "panel", title: "Repair panel", current: 1, target: 2 }]);
    expect(view.gauges).toEqual({ power: 42, pressure: 76 });
    expect(view.journey.remainingSeconds).toBe(298);
    expect(view.speed).toBe(0.7);
    expect(view.journey.speed).toBe(0.7);
    view.tasks[0]!.current = 2;
    expect(s.tasks.get("panel")!.current).toBe(1);
    expect(s.tick).toBe(140);
  });
  it("updates from adapter ticks and resets on a new run, excluding lobby and pause time", () => {
    const model = createLocalStateModel();
    const s = model.state;
    const read = createHudStateReader(20);
    s.phase = "lobby"; s.tick = 100;
    expect(read(s).journey.remainingSeconds).toBe(300);
    s.phase = "running"; s.tick = 500;
    expect(read(s).journey.remainingSeconds).toBe(300);
    for (let i = 0; i < 20; i++) model.drainAndStep();
    expect(read(s).journey.remainingSeconds).toBe(299);
    s.paused = true; read(s);
    s.tick += 100; expect(read(s).journey.remainingSeconds).toBe(299);
    s.paused = false; read(s);
    s.tick += 20; expect(read(s).journey.remainingSeconds).toBe(298);
    s.phase = "won"; read(s);
    s.tick += 100; expect(read(s).journey.remainingSeconds).toBe(298);
    s.phase = "running";
    expect(read(s).journey.remainingSeconds).toBe(300);
  });
  it("stops visual speed on pause or end, and clamps expired time", () => {
    const s = createLocalStateModel().state;
    s.speed = 1; s.paused = true;
    expect(localStateToHud(s, 20, 0).speed).toBe(0);
    s.paused = false; s.phase = "lost"; s.tick = 9000;
    const view = localStateToHud(s, 20, 0);
    expect(view.speed).toBe(0);
    expect(view.journey.phase).toBe("lost");
    expect(view.journey.remainingSeconds).toBe(0);
  });
});
