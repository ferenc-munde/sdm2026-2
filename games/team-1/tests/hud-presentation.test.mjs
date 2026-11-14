import assert from "node:assert/strict";
import { conditionBand, formatCountdown, toOutcomeViewModel, toRepairHint, toTaskViewModels } from "../client/presentation-model.mjs";

let passed = 0;
const failures = [];

async function test(name, run) {
  try {
    await run();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

await test("formats the supplied countdown without advancing client time", () => {
  assert.equal(formatCountdown(180), "03:00");
  assert.equal(formatCountdown(59), "00:59");
  assert.equal(formatCountdown(0), "00:00");
  assert.equal(formatCountdown(-3), "00:00");
  assert.equal(formatCountdown(Number.NaN), "00:00");
});

await test("assigns the expected train-condition band at thresholds", () => {
  assert.equal(conditionBand(100), "stable");
  assert.equal(conditionBand(61), "stable");
  assert.equal(conditionBand(60), "strained");
  assert.equal(conditionBand(26), "strained");
  assert.equal(conditionBand(25), "critical");
});

await test("maps task progress and readable status labels", () => {
  const tasks = toTaskViewModels([
    { id: "wire", label: "Reconnect signal wires", status: "in-progress", progress: 55 },
    { id: "brake", label: "Inspect brakes", status: "complete", progress: 100 },
  ]);
  assert.deepEqual(tasks.map((task) => [task.statusLabel, task.progress]), [["IN PROGRESS", 55], ["DONE", 100]]);
});

await test("shows where to go and when the local player can repair", () => {
  const snapshot = {
    localPlayerId: "p1",
    players: [{ id: "p1", section: "control" }],
    tasks: [
      { id: "wiring", label: "Reconnect the signal wires (Electrical Room)", section: "electrical", status: "available" },
      { id: "instruments", label: "Restore the control cabin instruments (Control Cabin)", section: "control", status: "in-progress" },
    ],
  };
  assert.deepEqual(toRepairHint(snapshot), {
    mode: "ready",
    text: "Restore the control cabin instruments (Control Cabin) · PRESS E TO REPAIR",
  });
  snapshot.players[0].section = "engine";
  assert.match(toRepairHint(snapshot).text, /^MOVE TO ELECTRICAL/);
});

await test("maps terminal snapshots to victory and failure result content", () => {
  assert.equal(toOutcomeViewModel({ kind: "playing", message: "Keep going" }), null);
  assert.deepEqual(toOutcomeViewModel({ kind: "victory", message: "Arrived" }), {
    title: "THE LINE HOLDS",
    tone: "victory",
    message: "Arrived",
  });
  assert.deepEqual(toOutcomeViewModel({ kind: "failure", message: "Stalled" }), {
    title: "THE TRAIN HAS STALLED",
    tone: "failure",
    message: "Stalled",
  });
});

console.log(`${passed}/${passed + failures.length} HUD presentation tests passed.`);
export const testResult = { passed, failed: failures.length };
if (failures.length > 0) throw new AggregateError(failures.map(({ error }) => error), "HUD presentation tests failed.");
