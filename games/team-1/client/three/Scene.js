import * as THREE from "three";

export function createScene() {
  const scene = new THREE.Scene();

  scene.background = new THREE.Color(0x18212b);
  scene.fog = new THREE.Fog(0x18212b, 35, 75);

  return scene;
}