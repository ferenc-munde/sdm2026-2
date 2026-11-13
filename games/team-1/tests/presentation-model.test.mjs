import assert from "node:assert/strict";
import { toPlayerViewModels } from "../client/presentation-model.mjs";
import { createPreviewSnapshot } from "../client/game-state-adapter.mjs";

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

await test("maps no players to an empty scene roster", () => {
  assert.deepEqual(toPlayerViewModels(createPreviewSnapshot()), []);
});

await test("maps snapshot positions, colors, and connection states to scene players", () => {
  const snapshot = createPreviewSnapshot([
    { id: "p1", name: "Engineer", connected: true },
    { id: "p2", name: "Signal Keeper", connected: false },
  ]);
  const players = toPlayerViewModels(snapshot);
  assert.equal(players.length, 2);
  assert.deepEqual([players[0].x, players[0].z, players[0].color], [0.18, 0.5, "#d6ac68"]);
  assert.equal(players[1].connected, false);
});

await test("caps rendered players at four and clamps normalized positions", () => {
  const snapshot = createPreviewSnapshot(Array.from({ length: 5 }, (_, index) => ({
    id: `p${index}`,
    name: `Player ${index}`,
    connected: true,
  })));
  snapshot.players[0].position.x = -1;
  snapshot.players[0].position.z = 3;
  const players = toPlayerViewModels(snapshot);
  assert.equal(players.length, 4);
  assert.deepEqual([players[0].x, players[0].z], [0, 1]);
});

console.log(`${passed}/${passed + failures.length} Three.js player mapping tests passed.`);
export const testResult = { passed, failed: failures.length };
if (failures.length > 0) throw new AggregateError(failures.map(({ error }) => error), "Player mapping tests failed.");
