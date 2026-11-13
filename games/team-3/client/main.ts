// Browser entry point: draws the train and the crew in a Three.js canvas.
//
// This is a hand-check page for the renderer (#10). The real client gets the
// state from the room once the platform host exists; until then it shows a
// small demo crew walking through the cars.

import { WebGLRenderer } from "three";
import { buildTrainScene, fitCameraToMap } from "./trainScene.ts";
import type { RenderPlayer } from "./renderPlayer.ts";
import { CAR_LENGTH, carCentreX } from "./trainMap.ts";

const container = document.getElementById("app");
if (!container) throw new Error("#app is missing from index.html");

const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(container.clientWidth, container.clientHeight);
container.appendChild(renderer.domElement);

const demoPlayers: RenderPlayer[] = [
  { id: "p1", name: "Driver", position: { x: carCentreX(0), y: 40 } },
  { id: "p2", name: "Stoker", position: { x: carCentreX(1), y: -40 } },
  { id: "p3", name: "Mechanic", position: { x: carCentreX(2), y: 30 } },
];

const train = buildTrainScene(demoPlayers);

const resize = (): void => {
  const width = container.clientWidth;
  const height = container.clientHeight;
  renderer.setSize(width, height);
  fitCameraToMap(train.camera, train.map, width / height);
};
resize();
window.addEventListener("resize", resize);

// Walk the crew along their car so it is obvious that the scene updates.
const walk = (time: number): void => {
  const seconds = time / 1000;
  const moved = demoPlayers.map((player, seat) => {
    const base = carCentreX(seat);
    const offset = Math.sin(seconds * 0.8 + seat) * (CAR_LENGTH / 3);
    return { ...player, position: { x: base + offset, y: player.position.y } };
  });
  train.updatePlayers(moved);
  renderer.render(train.scene, train.camera);
  requestAnimationFrame(walk);
};
requestAnimationFrame(walk);
