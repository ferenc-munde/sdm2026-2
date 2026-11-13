import * as THREE from "three";

export function createScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#101a27");

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(28, 18),
    new THREE.MeshStandardMaterial({
      color: "#263746",
      roughness: 0.9,
      metalness: 0.05,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new THREE.GridHelper(28, 28, "#587080", "#354b5b");
  grid.position.y = 0.015;
  scene.add(grid);

  scene.add(new THREE.AmbientLight("#d9e8f4", 1.8));

  const keyLight = new THREE.DirectionalLight("#fff1d2", 2.2);
  keyLight.position.set(-5, 10, 7);
  scene.add(keyLight);

  const placeholder = new THREE.Mesh(
    new THREE.BoxGeometry(3, 0.7, 2),
    new THREE.MeshStandardMaterial({
      color: "#e5aa54",
      roughness: 0.55,
      metalness: 0.15,
    }),
  );
  placeholder.position.y = 0.35;
  placeholder.castShadow = true;
  placeholder.receiveShadow = true;
  scene.add(placeholder);

  return scene;
}
