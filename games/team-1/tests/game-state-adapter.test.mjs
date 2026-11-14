import assert from "node:assert/strict";
import { createPreviewSnapshot, MockGameStateAdapter, reconcilePreviewPlayers } from "../client/game-state-adapter.mjs";

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

await test("creates a backend-shaped preview snapshot without mutating lobby players", () => {
  const players = [{ id: "p1", name: "Engineer", connected: true }];
  const snapshot = createPreviewSnapshot(players);
  snapshot.players[0].position.x = 0.99;
  assert.equal(players[0].position, undefined);
  assert.equal(createPreviewSnapshot(players).players[0].position.x, 0.18);
  assert.equal(snapshot.outcome.kind, "playing");
});

await test("spawns four distinct players and preserves existing positions and colors when the roster changes", () => {
  const crew = ["a", "b", "c", "d"].map((id) => ({ id, name: id, connected: true }));
  const initial = createPreviewSnapshot(crew).players;
  assert.equal(new Set(initial.map((player) => player.color)).size, 4);
  assert.equal(new Set(initial.map((player) => JSON.stringify(player.position))).size, 4);
  initial[2].position.x = 0.7;
  const remaining = reconcilePreviewPlayers([crew[2], crew[0]], initial);
  assert.deepEqual(remaining[0], initial[2]);
  assert.deepEqual(remaining[1], initial[0]);
  const added = reconcilePreviewPlayers([crew[2], crew[0], crew[3]], remaining);
  assert.deepEqual(added[0], initial[2]);
  assert.equal(added[2].color, initial[1].color);
  assert.deepEqual(added[2].position, initial[1].position);
});

await test("publishes synchronized player state to client subscribers", () => {
  const client = new MockGameStateAdapter(createPreviewSnapshot());
  const received = [];
  client.subscribe((snapshot) => received.push(snapshot.players.map((player) => player.id)));
  const next = createPreviewSnapshot([
    { id: "p1", name: "Engineer", connected: true },
    { id: "p2", name: "Signal Keeper", connected: true },
  ]);
  client.publish(next);
  assert.deepEqual(received, [["p1", "p2"]]);
  assert.equal(client.getSnapshot().players.length, 2);
});

await test("publishes countdown and train condition values as received state", () => {
  const client = new MockGameStateAdapter(createPreviewSnapshot());
  const received = [];
  client.subscribe((snapshot) => received.push([snapshot.secondsRemaining, snapshot.trainCondition]));
  client.publish({ ...client.getSnapshot(), secondsRemaining: 42, trainCondition: 65 });
  assert.deepEqual(received, [[42, 65]]);
});

await test("publishes task progress and completed repair count", () => {
  const client = new MockGameStateAdapter(createPreviewSnapshot());
  client.publish({
    ...client.getSnapshot(),
    repairs: { completed: 1, total: 3 },
    tasks: [{ id: "wiring", label: "Reconnect the signal wires", status: "complete", progress: 100 }],
  });
  assert.deepEqual(client.getSnapshot().repairs, { completed: 1, total: 3 });
  assert.equal(client.getSnapshot().tasks[0].status, "complete");
});

await test("publishes victory and failure outcome snapshots", () => {
  const client = new MockGameStateAdapter(createPreviewSnapshot());
  client.publish({ ...client.getSnapshot(), outcome: { kind: "victory", message: "You made it." } });
  assert.equal(client.getSnapshot().outcome.kind, "victory");
  client.publish({ ...client.getSnapshot(), outcome: { kind: "failure", message: "The train stalled." } });
  assert.equal(client.getSnapshot().outcome.kind, "failure");
});

await test("isolates repair counters across inputs, snapshots and subscribers", () => {
  const initial = createPreviewSnapshot();
  const client = new MockGameStateAdapter(initial);
  initial.repairs.completed = 99;
  assert.equal(client.getSnapshot().repairs.completed, 0);
  client.getSnapshot().repairs.total = 99;
  assert.equal(client.getSnapshot().repairs.total, 5);
  const received = [];
  client.subscribe((snapshot) => { snapshot.repairs.completed = 99; });
  client.subscribe((snapshot) => received.push(snapshot.repairs.completed));
  const next = createPreviewSnapshot();
  next.repairs.completed = 1;
  client.publish(next);
  assert.deepEqual(received, [1]);
  next.repairs.completed = 99;
  assert.equal(client.getSnapshot().repairs.completed, 1);
});

console.log(`${passed}/${passed + failures.length} game state adapter tests passed.`);
export const testResult = { passed, failed: failures.length };
if (failures.length > 0) throw new AggregateError(failures.map(({ error }) => error), "Game state adapter tests failed.");
