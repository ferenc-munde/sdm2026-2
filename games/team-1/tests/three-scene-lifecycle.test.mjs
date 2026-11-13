import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { createTestViteServer } from "./helpers/vite-loader.mjs";

const browser = new Window({ url: "http://localhost/" });
globalThis.window = browser;
const createdObservers = [];
globalThis.ResizeObserver = class {
  constructor() {
    this.disconnected = false;
    createdObservers.push(this);
  }
  observe() {}
  disconnect() { this.disconnected = true; }
};
const pendingFrames = new Set();
let nextFrame = 1;
globalThis.requestAnimationFrame = () => {
  const id = nextFrame++;
  pendingFrames.add(id);
  return id;
};
globalThis.cancelAnimationFrame = (id) => pendingFrames.delete(id);

const vite = await createTestViteServer();
try {
  const { mountTrainScene, PLAYER_INSET } = await vite.ssrLoadModule("/client/player-scene.ts");
  const { TRAIN_LAYOUT } = await vite.ssrLoadModule("/client/environment/TrainEnvironment.ts");
  // Normalized snapshot x (0..1) to world x: along the train, inset from both end walls.
  const worldX = (x) => -TRAIN_LAYOUT.length / 2 + PLAYER_INSET.length + x * (TRAIN_LAYOUT.length - PLAYER_INSET.length * 2);
  const { createPreviewSnapshot } = await vite.ssrLoadModule("/client/game-state-adapter.mjs");

  function createHarness() {
    const observerStart = createdObservers.length;
    const canvas = { clientWidth: 640, clientHeight: 480, hidden: false };
    const fallback = { hidden: true };
    let renderedScene;
    let rendererDisposed = false;
    const renderer = {
      setPixelRatio() {},
      setSize() {},
      render(scene) { renderedScene = scene; },
      dispose() { rendererDisposed = true; },
    };
    const train = mountTrainScene(canvas, fallback, () => renderer);
    const avatars = () => {
      const groups = [];
      renderedScene.traverse((object) => {
        if (object.type === "Group" && object.name === "player") groups.push(object);
      });
      return groups;
    };
    return {
      train,
      avatars,
      renderer,
      fallback,
      observers: createdObservers.slice(observerStart),
      get rendererDisposed() { return rendererDisposed; },
    };
  }

  let passed = 0;
  const failures = [];
  function test(name, run) {
    try {
      run();
      passed += 1;
      console.log(`PASS ${name}`);
    } catch (error) {
      failures.push({ name, error });
      console.error(`FAIL ${name}: ${error.message}`);
    }
  }

  test("creates avatars and updates snapshot positions and connection appearance", () => {
    const scene = createHarness();
    const snapshot = createPreviewSnapshot([
      { id: "p1", name: "Engineer", connected: true },
      { id: "p2", name: "Signal Keeper", connected: true },
    ]);
    scene.train.update(snapshot);
    const [first, second] = scene.avatars();
    assert.equal(scene.avatars().length, 2);
    assert.equal(first.position.x, worldX(snapshot.players[0].position.x));
    const updated = createPreviewSnapshot([
      { id: "p1", name: "Engineer", connected: false },
      { id: "p2", name: "Signal Keeper", connected: true },
    ]);
    updated.players[0].position.x = 0.75;
    scene.train.update(updated);
    const [updatedFirst, updatedSecond] = scene.avatars();
    assert.equal(updatedFirst.uuid, first.uuid);
    assert.ok(Math.abs(updatedFirst.position.x - worldX(0.75)) < 1e-9);
    assert.equal(updatedFirst.children[0].material.opacity, 0.38);
    assert.equal(updatedSecond.uuid, second.uuid);
    scene.train.dispose();
  });

  test("keeps the remaining avatar and marker colors synchronized after roster changes", () => {
    const scene = createHarness();
    try {
      scene.train.update(createPreviewSnapshot([
        { id: "p1", name: "Engineer", connected: true },
        { id: "p2", name: "Signal Keeper", connected: true },
      ]));
      const remaining = scene.avatars()[1];
      const next = createPreviewSnapshot([{ id: "p2", name: "Signal Keeper", connected: true }]);
      scene.train.update(next);
      assert.equal(scene.avatars()[0].uuid, remaining.uuid);
      const expectedColor = next.players[0].color.slice(1);
      assert.equal(remaining.children[0].material.color.getHexString(), expectedColor);
      assert.equal(remaining.children[2].material.color.getHexString(), expectedColor);
    } finally {
      scene.train.dispose();
    }
  });

  test("disposes per-player materials and marker geometry on removal, then shared geometry at scene teardown", () => {
    const scene = createHarness();
    scene.train.update(createPreviewSnapshot([
      { id: "p1", name: "Engineer", connected: true },
      { id: "p2", name: "Signal Keeper", connected: true },
    ]));
    const [first, second] = scene.avatars();
    const watch = (resource) => {
      let count = 0;
      resource.addEventListener("dispose", () => count++);
      return () => count;
    };
    const firstMarkerGeometryDisposed = watch(first.children[2].geometry);
    const firstMarkerMaterialDisposed = watch(first.children[2].material);
    const firstBodyMaterialDisposed = watch(first.children[0].material);
    const secondMarkerGeometryDisposed = watch(second.children[2].geometry);
    const secondMarkerMaterialDisposed = watch(second.children[2].material);
    const secondBodyMaterialDisposed = watch(second.children[0].material);
    const bodyGeometryDisposed = watch(first.children[0].geometry);
    const headGeometryDisposed = watch(first.children[1].geometry);

    scene.train.update(createPreviewSnapshot([{ id: "p2", name: "Signal Keeper", connected: true }]));
    assert.equal(scene.avatars().length, 1);
    assert.equal(firstMarkerGeometryDisposed(), 1);
    assert.equal(firstMarkerMaterialDisposed(), 1);
    assert.equal(firstBodyMaterialDisposed(), 1);
    assert.equal(bodyGeometryDisposed(), 0, "geometry shared by remaining players must stay alive");

    scene.train.update(createPreviewSnapshot());
    assert.equal(scene.avatars().length, 0);
    assert.equal(secondMarkerGeometryDisposed(), 1);
    assert.equal(secondMarkerMaterialDisposed(), 1);
    assert.equal(secondBodyMaterialDisposed(), 1);
    assert.equal(bodyGeometryDisposed(), 0, "shared avatar geometry is released with the scene");
    assert.equal(headGeometryDisposed(), 0);

    scene.train.dispose();
    assert.equal(bodyGeometryDisposed(), 1);
    assert.equal(headGeometryDisposed(), 1);
    assert.equal(scene.rendererDisposed, true);
    assert.equal(scene.observers[0].disconnected, true);
    assert.equal(pendingFrames.size, 0);
  });

  console.log(`${passed}/${passed + failures.length} Three.js lifecycle tests passed.`);
  if (failures.length) throw new AggregateError(failures.map(({ error }) => error), "Three.js lifecycle tests failed.");
} finally {
  await vite.close();
  await browser.happyDOM.close();
}
