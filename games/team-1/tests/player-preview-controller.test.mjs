import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { createTestViteServer } from "./helpers/vite-loader.mjs";

const browser = new Window({ url: "http://localhost/" });
globalThis.window = browser;
const vite = await createTestViteServer();
try {
  const { createPreviewSnapshot, MockGameStateAdapter } = await vite.ssrLoadModule("/client/game-state-adapter.mjs");
  const { PlayerPreviewController } = await vite.ssrLoadModule("/client/player-preview-controller.ts");
  const { InteractionSystem } = await vite.ssrLoadModule("/client/player/Interaction.ts");
  const { Inventory } = await vite.ssrLoadModule("/client/player/Inventory.ts");
  const interactions = new InteractionSystem(1);
  let uses = 0;
  interactions.registerTarget({ id: "panel", x: 1, y: 0, type: "equipment", onInteract: () => uses++ });
  assert.equal(interactions.attemptInteraction(-0.01, 0), false);
  assert.equal(interactions.attemptInteraction(0, 0), true);
  assert.equal(uses, 1);
  interactions.unregisterTarget("panel");
  assert.equal(interactions.attemptInteraction(0, 0), false);
  interactions.destroy();
  const inventory = new Inventory(1);
  assert.equal(inventory.addItem({ id: "wire", name: "Wire", type: "item", quantity: 2, maxStack: 3 }), true);
  assert.equal(inventory.addItem({ id: "wire", name: "Wire", type: "item", quantity: 2, maxStack: 3 }), false);
  assert.equal(inventory.getItem("wire").quantity, 2);
  assert.equal(inventory.removeItem("wire", 3), false);
  assert.equal(inventory.removeItem("wire", 2), true);
  assert.equal(inventory.getSlotsUsed(), 0);
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
  browser.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "e" }));
  controller.update(0);
  assert.deepEqual(adapter.getSnapshot().previewMechanics.inventory.map((item) => item.id), ["wrench"]);
  assert.equal(adapter.getSnapshot().previewMechanics.items.some((item) => item.id === "wrench"), false);
  browser.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "e", repeat: true }));
  controller.update(0);
  assert.equal(adapter.getSnapshot().previewMechanics.inventory.length, 1);
  controller.removeItem("wrench");
  controller.update(0);
  assert.equal(adapter.getSnapshot().previewMechanics.inventory.length, 0);
  browser.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "1" }));
  controller.update(0);
  assert.equal(adapter.getSnapshot().players[0].signal, "Ready");
  browser.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "1" }));
  controller.update(0);
  assert.equal(adapter.getSnapshot().players[0].signal, "");
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
