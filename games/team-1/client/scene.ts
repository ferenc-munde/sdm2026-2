import * as THREE from "three";
import { createTrainEnvironment } from "./environment/TrainEnvironment";

export function createScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#0c1720");

  scene.add(createTrainEnvironment());

  scene.add(new THREE.HemisphereLight("#d9e8f4", "#26313a", 1.45));

  const keyLight = new THREE.DirectionalLight("#fff0cf", 2.65);
  keyLight.position.set(-5, 10, 7);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight("#89bbd1", 0.8);
  fillLight.position.set(8, 6, -5);
  scene.add(fillLight);

  return scene;
}
