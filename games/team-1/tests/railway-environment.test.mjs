import assert from "node:assert/strict";
import * as THREE from "three";
import { createTestViteServer } from "./helpers/vite-loader.mjs";

const vite = await createTestViteServer();
try {
  const { createRailwayEnvironment, RAILWAY_LAYOUT, wrapX } = await vite.ssrLoadModule("/client/environment/RailwayEnvironment.ts");
  const { advanceTrainMotion } = await vite.ssrLoadModule("/client/environment/effects/TrainMotionEffects.ts");
  const { createScene } = await vite.ssrLoadModule("/client/scene.ts");
  const { trainCameraViewHeight } = await vite.ssrLoadModule("/client/player-scene.ts");
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

  function xPositions(mesh) {
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const values = [];
    for (let index = 0; index < mesh.count; index += 1) {
      mesh.getMatrixAt(index, matrix);
      matrix.decompose(position, quaternion, scale);
      values.push(position.x);
    }
    return values;
  }

  test("creates visible rails, sleepers, ballast, trees, poles, terrain and lamps", () => {
    const railway = createRailwayEnvironment();
    const roles = new Set();
    railway.traverse((object) => {
      if (object.userData.role) roles.add(object.userData.role);
    });
    assert.ok(roles.has("railway-ground"));
    assert.ok(roles.has("ballast-bed"));
    assert.ok(roles.has("rail-batch"));
    assert.ok(roles.has("sleeper-batch"));
    assert.ok(roles.has("ballast-patch-batch"));
    assert.ok(roles.has("railway-tree-batch"));
    assert.ok(roles.has("railway-pole-batch"));
    assert.ok(roles.has("trackside-light-batch"));
    assert.ok(roles.has("trackside-terrain-batch"));
    const rails = railway.userData.motionBatches.filter((mesh) => mesh.userData.role === "rail-batch");
    const sleepers = railway.userData.motionBatches.filter((mesh) => mesh.userData.role === "sleeper-batch");
    assert.equal(rails.length, 2);
    assert.equal(rails.reduce((count, mesh) => count + mesh.count, 0), 36);
    assert.equal(sleepers.reduce((count, mesh) => count + mesh.count, 0), 72);
    for (const batch of rails) {
      const baseXs = batch.userData.motionInstances.map((instance) => instance.baseX);
      assert.ok(Math.min(...baseXs) < -13, "rails extend beyond the front of the train");
      assert.ok(Math.max(...baseXs) > 13, "rails extend beyond the rear of the train");
    }
  });

  test("scrolls track pieces backward and preserves sleeper spacing across the loop", () => {
    const railway = createRailwayEnvironment();
    const train = new THREE.Group();
    const sleepers = railway.userData.motionBatches.find((mesh) => mesh.userData.role === "sleeper-batch");
    const start = xPositions(sleepers);
    advanceTrainMotion(railway, train, 0.25);
    const after = xPositions(sleepers);
    const expectedFirst = wrapX(start[0] - RAILWAY_LAYOUT.travelSpeed * 0.25);
    assert.ok(Math.abs(after[0] - expectedFirst) < 1e-5, `expected first sleeper at ${expectedFirst}, got ${after[0]}`);
    const ordered = [...after].sort((a, b) => a - b);
    for (let index = 1; index < ordered.length; index += 1) {
      assert.ok(Math.abs(ordered[index] - ordered[index - 1] - RAILWAY_LAYOUT.sleeperSpacing) < 1e-5);
    }
    const wrapGap = ordered[0] + RAILWAY_LAYOUT.loopLength - ordered.at(-1);
    assert.ok(Math.abs(wrapGap - RAILWAY_LAYOUT.sleeperSpacing) < 1e-5);
  });

  test("motion is frame-rate independent and vibrates only the visual train root", () => {
    const first = createRailwayEnvironment();
    const second = createRailwayEnvironment();
    const firstTrain = new THREE.Group();
    const secondTrain = new THREE.Group();
    advanceTrainMotion(first, firstTrain, 0.4);
    for (let index = 0; index < 4; index += 1) advanceTrainMotion(second, secondTrain, 0.1);
    assert.ok(Math.abs(first.userData.travelDistance - second.userData.travelDistance) < 1e-12);
    const firstSleepers = first.userData.motionBatches.find((mesh) => mesh.userData.role === "sleeper-batch");
    const secondSleepers = second.userData.motionBatches.find((mesh) => mesh.userData.role === "sleeper-batch");
    assert.deepEqual(xPositions(firstSleepers), xPositions(secondSleepers));
    assert.ok(Math.abs(firstTrain.position.x) > 0.005);
    assert.ok(Math.abs(firstTrain.rotation.z) > 0.0001);
  });

  test("scene uses night atmosphere and keeps the existing train interior and motion roots", () => {
    const scene = createScene();
    assert.equal(scene.background.getHexString(), "050a16");
    assert.ok(scene.fog instanceof THREE.Fog);
    assert.equal(scene.userData.railwayMotion.name, "railway-environment");
    assert.equal(scene.userData.trainMotionRoot.name, "train-motion-root");
    const train = scene.userData.trainMotionRoot.getObjectByName("train-environment");
    assert.ok(train);
    assert.equal(train.userData.sectionCount, 5);
    const repairAreas = [];
    train.traverse((object) => {
      if (object.userData.role === "repair-area") repairAreas.push(object.userData.sectionId);
    });
    assert.deepEqual(repairAreas, ["engine", "electrical", "control", "passenger", "rear"]);
  });

  test("camera framing fits the train and exterior rails at laptop and full HD aspect ratios", () => {
    const trainWidth = trainCameraViewHeight(16 / 9);
    const trainHeight = trainCameraViewHeight(4 / 3);
    assert.ok(trainWidth * (16 / 9) >= 36, "16:9 view leaves room for the full train and end margin");
    assert.ok(trainHeight * (4 / 3) >= 36, "4:3 laptop view leaves room for the full train and end margin");
    assert.ok(trainWidth >= 19.2, "16:9 view includes both exterior rails with margin");
    assert.ok(trainHeight >= 19.2, "4:3 view includes both exterior rails with margin");
  });

  console.log(`${passed}/${passed + failures.length} railway environment tests passed.`);
  if (failures.length) throw new AggregateError(failures.map(({ error }) => error), "Railway environment tests failed.");
} finally {
  await vite.close();
}
