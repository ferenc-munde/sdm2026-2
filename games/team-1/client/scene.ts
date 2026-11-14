import * as THREE from "three";
import { createTrainEnvironment } from "./environment/TrainEnvironment";
import { createRailwayEnvironment } from "./environment/RailwayEnvironment";

export function createScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#050a16");
  scene.fog = new THREE.Fog("#07111d", 32, 78);

  const railway = createRailwayEnvironment();
  scene.add(railway);

  const trainRoot = new THREE.Group();
  trainRoot.name = "train-motion-root";
  trainRoot.add(createTrainEnvironment());
  scene.add(trainRoot);
  scene.userData.railwayMotion = railway;
  scene.userData.trainMotionRoot = trainRoot;

  scene.add(new THREE.HemisphereLight("#bacce5", "#101720", 1.15));

  const moonlight = new THREE.DirectionalLight("#a7c5e9", 1.8);
  moonlight.position.set(-6, 18, -9);
  scene.add(moonlight);

  const warmCabinFill = new THREE.DirectionalLight("#ffdca8", 1.1);
  warmCabinFill.position.set(-4, 12, 8);
  scene.add(warmCabinFill);

  return scene;
}
