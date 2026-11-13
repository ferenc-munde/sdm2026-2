import * as THREE from "three";

export function createCarriage() {
  const carriage = new THREE.Group();

  const materials = {
    floor: new THREE.MeshStandardMaterial({
      color: 0x454b52,
      roughness: 0.9,
    }),
    wall: new THREE.MeshStandardMaterial({
      color: 0x303943,
      roughness: 0.85,
    }),
    window: new THREE.MeshStandardMaterial({
      color: 0x287b9b,
      metalness: 0.25,
      roughness: 0.35,
    }),
    door: new THREE.MeshStandardMaterial({
      color: 0xb27b43,
      roughness: 0.8,
    }),
  };

  // Carriage floor: 12 units wide and 24 units long.
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(12, 0.3, 24),
    materials.floor
  );

  floor.position.y = 0;
  floor.receiveShadow = true;
  carriage.add(floor);

  // Side walls.
  function addWall(width, height, depth, x, y, z) {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      materials.wall
    );

    wall.position.set(x, y, z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    carriage.add(wall);
  }

  addWall(0.35, 2.8, 24, -6, 1.4, 0);
  addWall(0.35, 2.8, 24, 6, 1.4, 0);

  // End walls, leaving a central passage for connecting carriages.
  addWall(4.8, 2.8, 0.35, -3.6, 1.4, -12);
  addWall(4.8, 2.8, 0.35, 3.6, 1.4, -12);

  addWall(4.8, 2.8, 0.35, -3.6, 1.4, 12);
  addWall(4.8, 2.8, 0.35, 3.6, 1.4, 12);

  // Decorative windows on the floor-side edges.
  for (const z of [-8, -3, 3, 8]) {
    for (const x of [-5.78, 5.78]) {
      const windowPanel = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 1.2, 2.6),
        materials.window
      );

      windowPanel.position.set(x, 1.8, z);
      carriage.add(windowPanel);
    }
  }

  // Door panels at both carriage ends.
  for (const z of [-11.65, 11.65]) {
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(2, 0.12, 0.35),
      materials.door
    );

    door.position.set(0, 0.22, z);
    carriage.add(door);
  }

  return carriage;
}