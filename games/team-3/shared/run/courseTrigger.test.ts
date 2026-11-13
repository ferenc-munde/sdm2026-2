import { describe, expect, it } from "vitest";
import { COURSE_HULL_DAMAGE, COURSE_WARNING_SECONDS, HULL_START, TICK_SECONDS } from "../constants.ts";
import { courseSystem } from "../hazards/course.ts";
import type { GameState, Station } from "../types.ts";
import {
  COURSE_INTERVAL_SECONDS,
  COURSE_SPOT_ID,
  courseEventsDueBy,
  courseSpot,
  courseTriggerSystem,
  stepCourseTrigger,
} from "./courseTrigger.ts";
import { createSeededRandom } from "./random.ts";
import { createSession, type GameSession, joinSession, startSession, stepSession, type StepSystem } from "./session.ts";
import { makeState } from "./testState.ts";

const CONSOLE: Station = { kind: "steeringConsole", car: 0, position: { x: -160, y: -80 } };

const courses = (state: GameState) => Object.values(state.hazards).filter((hazard) => hazard.kind === "course");

/** Advances the run clock by one tick and runs the trigger, as the session does. */
function tick(state: GameState): GameState {
  const advanced = { ...state, time: state.time + TICK_SECONDS };
  return stepCourseTrigger(advanced, TICK_SECONDS, CONSOLE);
}

function runFor(seconds: number, start: GameState = makeState()): GameState {
  let state = start;
  for (let i = 0; i < Math.round(seconds / TICK_SECONDS); i++) state = tick(state);
  return state;
}

describe("course events due", () => {
  it("counts one event per full interval of run time", () => {
    expect(courseEventsDueBy(0)).toBe(0);
    expect(courseEventsDueBy(COURSE_INTERVAL_SECONDS - 0.01)).toBe(0);
    expect(courseEventsDueBy(COURSE_INTERVAL_SECONDS)).toBe(1);
    expect(courseEventsDueBy(2 * COURSE_INTERVAL_SECONDS + 1)).toBe(2);
  });

  it("is zero for broken numbers", () => {
    expect(courseEventsDueBy(Number.NaN)).toBe(0);
    expect(courseEventsDueBy(100, 0)).toBe(0);
    expect(courseEventsDueBy(-5)).toBe(0);
  });
});

describe("course trigger", () => {
  it("starts nothing before the first interval", () => {
    expect(courses(runFor(COURSE_INTERVAL_SECONDS - 0.5))).toHaveLength(0);
  });

  it("starts the first event at 45 seconds, on the steering console's spot, with a full warning", () => {
    const [event] = courses(runFor(COURSE_INTERVAL_SECONDS));
    expect(event).toMatchObject({
      kind: "course",
      spotId: COURSE_SPOT_ID,
      car: CONSOLE.car,
      position: CONSOLE.position,
      countdown: COURSE_WARNING_SECONDS,
      progress: 0,
    });
    expect(courseSpot(CONSOLE)).toEqual({ id: COURSE_SPOT_ID, car: 0, position: { x: -160, y: -80 } });
  });

  it("does not start a second event while one is still running", () => {
    // The trigger alone never removes events, so the first one is still there at 90 seconds.
    expect(courses(runFor(2 * COURSE_INTERVAL_SECONDS + 1))).toHaveLength(1);
  });

  it("starts nothing outside the playing phase", () => {
    for (const phase of ["lobby", "won", "lost"] as const) {
      expect(courses(runFor(COURSE_INTERVAL_SECONDS + 1, makeState({ phase })))).toHaveLength(0);
    }
  });

  it("does not change the state it is given", () => {
    const state = makeState({ time: COURSE_INTERVAL_SECONDS });
    const snapshot = structuredClone(state);
    stepCourseTrigger(state, TICK_SECONDS, CONSOLE);
    expect(state).toEqual(snapshot);
  });
});

describe("in a run, with the course rule", () => {
  function play(seconds: number, systems: StepSystem[]): GameSession {
    let session = createSession("TEST");
    for (const id of ["p1", "p2"]) {
      const joined = joinSession(session, id, id, { x: 300, y: 0 });
      if (!joined.ok) throw new Error(joined.error);
      session = joined.session;
    }
    const started = startSession(session);
    if (!started.ok) throw new Error(started.error);
    session = started.session;
    const random = createSeededRandom(1);
    for (let i = 0; i < Math.round(seconds / TICK_SECONDS); i++) {
      session = stepSession(session, TICK_SECONDS, { spots: [], random, systems });
    }
    return session;
  }

  const systems = [courseTriggerSystem(CONSOLE), courseSystem(CONSOLE)];

  it("shows a warning at 45 seconds", () => {
    expect(courses(play(COURSE_INTERVAL_SECONDS + 1, systems).state)).toHaveLength(1);
  });

  it("costs hull once per missed event, on a 45 second rhythm", () => {
    // Nobody is at the console, so every event is missed when its warning runs out.
    const afterFirst = play(COURSE_INTERVAL_SECONDS + COURSE_WARNING_SECONDS + 1, systems).state;
    expect(courses(afterFirst)).toHaveLength(0);
    expect(afterFirst.journey.hull).toBe(HULL_START - COURSE_HULL_DAMAGE);

    const afterSecond = play(2 * COURSE_INTERVAL_SECONDS + COURSE_WARNING_SECONDS + 1, systems).state;
    expect(afterSecond.journey.hull).toBe(HULL_START - 2 * COURSE_HULL_DAMAGE);
  });
});
