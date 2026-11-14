import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { createTestViteServer } from "./helpers/vite-loader.mjs";

const browser = new Window({ url: "http://localhost/" });
globalThis.window = browser;
const vite = await createTestViteServer();
try {
  const { createPreviewSnapshot, MockGameStateAdapter } = await vite.ssrLoadModule("/client/game-state-adapter.mjs");
  const { PlayerPreviewController } = await vite.ssrLoadModule("/client/player-preview-controller.ts");
  const adapter = new MockGameStateAdapter(createPreviewSnapshot([
    { id: "local", name: "Engineer", connected: true },
    { id: "guest", name: "Signal Keeper", connected: true },
  ]));
  const received = [];
  adapter.subscribe((snapshot) => received.push(snapshot));
  const controller = new PlayerPreviewController("local", adapter);
  const before = adapter.getSnapshot();
  browser.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "w" }));
  controller.update(100);
  browser.dispatchEvent(new browser.KeyboardEvent("keyup", { key: "w" }));
  const after = adapter.getSnapshot();
  assert.ok(after.players[0].position.z < before.players[0].position.z);
  assert.equal(after.players[0].position.x, before.players[0].position.x);
  assert.equal(after.players[0].direction, "up");
  assert.equal(after.players[0].isMoving, true);
  assert.deepEqual(after.players[1], before.players[1]);
  assert.equal(received.length, 1);
  controller.update(100);
  assert.equal(adapter.getSnapshot().players[0].direction, "up");
  assert.equal(adapter.getSnapshot().players[0].isMoving, false);
  controller.dispose();
  controller.dispose();
  const positionAfterDispose = adapter.getSnapshot().players[0].position;
  browser.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "d" }));
  controller.update(100);
  assert.deepEqual(adapter.getSnapshot().players[0].position, positionAfterDispose);
  browser.dispatchEvent(new browser.KeyboardEvent("keyup", { key: "d" }));
  console.log("PASS player controls update only the local mock snapshot and dispose safely");
} finally {
  await vite.close();
  await browser.happyDOM.close();
}
