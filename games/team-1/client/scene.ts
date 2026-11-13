import * as THREE from "three";
import { createTrainEnvironment } from "./environment/TrainEnvironment";

export function createScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#101a27");

  scene.add(createTrainEnvironment());

  scene.add(new THREE.AmbientLight("#d9e8f4", 1.8));

  const keyLight = new THREE.DirectionalLight("#fff1d2", 2.2);
  keyLight.position.set(-5, 10, 7);
  scene.add(keyLight);

  return scene;
}
