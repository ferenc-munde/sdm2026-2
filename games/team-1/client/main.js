import { createScene } from "./three/Scene.js";
import { createCamera, resizeCamera } from "./three/Camera.js";
import { createRenderer } from "./three/Renderer.js";
import { addLighting } from "./three/Lighting.js";
import { createCarriage } from "./world/Carriage.js";
import { createSeats } from "./world/Seats.js";
import { createPlayer } from "./players/Player.js";
import { createPlayerControls } from "./players/PlayerControls.js";
import * as THREE from "three";

function startGame() {
  const container = document.getElementById("game-container");

  if (!container) {
    throw new Error("Game container was not found.");
  }

  const scene = createScene();

  const aspectRatio =
    container.clientWidth / container.clientHeight;

  const camera = createCamera(aspectRatio);
  const renderer = createRenderer(container);

  addLighting(scene);

  const carriage = createCarriage();
  scene.add(carriage);

  const seats = createSeats();
  scene.add(seats);

  // Create four players in the central aisle
const players = [
  createPlayer(1, -1.1, -9),
  createPlayer(2, 1.1, -9),
  createPlayer(3, -1.1, 9),
  createPlayer(4, 1.1, 9)
];

players.forEach(player => scene.add(player));

const controls = createPlayerControls(players);
const clock = new THREE.Clock();

  function handleResize() {
    const width = container.clientWidth;
    const height = container.clientHeight;

    if (!width || !height) return;

    renderer.setSize(width, height);
    resizeCamera(camera, width / height);
  }

  window.addEventListener("resize", handleResize);

 renderer.setAnimationLoop(() => {
  const delta = Math.min(clock.getDelta(), 0.05);

  controls.update(delta);
  renderer.render(scene, camera);
});

  console.log("The Last Train: Three.js initialized.");
}

startGame();