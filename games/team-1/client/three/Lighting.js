import * as THREE from "three";

export function addLighting(scene) {
  const ambientLight = new THREE.AmbientLight(0xffffff, 1.8);
  scene.add(ambientLight);

  const mainLight = new THREE.DirectionalLight(0xffffff, 2.2);

  mainLight.position.set(-8, 18, 10);
  mainLight.castShadow = true;

  mainLight.shadow.mapSize.set(1024, 1024);

  mainLight.shadow.camera.left = -20;
  mainLight.shadow.camera.right = 20;
  mainLight.shadow.camera.top = 30;
  mainLight.shadow.camera.bottom = -30;

  scene.add(mainLight);
}