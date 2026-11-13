import * as THREE from "three";

export function createSeats() {
  const seats = new THREE.Group();
  seats.name = "PassengerSeating";

  const materials = {
    fabric: new THREE.MeshStandardMaterial({
      color: 0x315b68,
      roughness: 0.9
    }),
    cushion: new THREE.MeshStandardMaterial({
      color: 0x477987,
      roughness: 0.95
    }),
    frame: new THREE.MeshStandardMaterial({
      color: 0x343b42,
      roughness: 0.7,
      metalness: 0.35
    }),
    armrest: new THREE.MeshStandardMaterial({
      color: 0x8a9298,
      roughness: 0.65,
      metalness: 0.25
    })
  };

  function addBox(parent, width, height, depth, material, x, y, z) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      material
    );

    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);

    return mesh;
  }

  function createBench(x, z, side) {
    const bench = new THREE.Group();
    bench.position.set(x, 0, z);

    // Metal support frame
    addBox(bench, 1.55, 0.18, 2.05, materials.frame, 0, 0.38, 0);

    // Main seat cushion
    addBox(bench, 1.65, 0.28, 2.15, materials.fabric, 0, 0.62, 0);

    // Soft cushion surface
    addBox(bench, 1.52, 0.12, 2.02, materials.cushion, 0, 0.81, 0);

    // Backrest faces the central aisle
    const backX = side === "left" ? -0.68 : 0.68;

    addBox(
      bench,
      0.25,
      1.05,
      2.15,
      materials.fabric,
      backX,
      1.13,
      0
    );

    // Backrest cushion
    const cushionX = side === "left" ? -0.52 : 0.52;

    addBox(
      bench,
      0.12,
      0.78,
      1.92,
      materials.cushion,
      cushionX,
      1.15,
      0
    );

    // Armrests at both ends
    for (const end of [-1, 1]) {
      const armZ = end * 0.98;

      addBox(
        bench,
        1.65,
        0.16,
        0.16,
        materials.armrest,
        0,
        1.02,
        armZ
      );
    }

    // Four support legs
    for (const legX of [-0.62, 0.62]) {
      for (const legZ of [-0.82, 0.82]) {
        addBox(
          bench,
          0.12,
          0.42,
          0.12,
          materials.frame,
          legX,
          0.22,
          legZ
        );
      }
    }

    seats.add(bench);
  }

  // Four seating bays on each side of the carriage.
  const seatingPositions = [-7, -2.5, 2.5, 7];

  for (const z of seatingPositions) {
    createBench(-3.75, z, "left");
    createBench(3.75, z, "right");
  }

  return seats;
}
