import * as THREE from "three";
import { createScene } from "./scene";

const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas");

if (!canvas) {
  throw new Error("Missing #game-canvas element.");
}

const scene = createScene();
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const viewHeight = 20;
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
camera.position.set(0, 24, 0);
camera.up.set(0, 0, -1);
camera.lookAt(0, 0, 0);

function resizeAndRender(): void {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const aspect = width / height;

  camera.left = (-viewHeight * aspect) / 2;
  camera.right = (viewHeight * aspect) / 2;
  camera.top = viewHeight / 2;
  camera.bottom = -viewHeight / 2;
  camera.updateProjectionMatrix();

  renderer.setSize(width, height, false);
  renderer.render(scene, camera);
}

window.addEventListener("resize", resizeAndRender);
resizeAndRender();
