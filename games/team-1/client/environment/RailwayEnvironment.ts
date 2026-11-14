import * as THREE from "three";

/** World units used by the client-only exterior around the train interior. */
export const RAILWAY_LAYOUT = {
  loopLength: 72,
  sleeperSpacing: 2,
  sleeperCount: 36,
  railSegmentLength: 8,
  trackCenterOffset: 6.55,
  railGauge: 1.44,
  travelSpeed: 5.2,
} as const;

interface InstanceTransform {
  baseX: number;
  y: number;
  z: number;
  speedFactor: number;
  scaleX?: number;
  scaleY?: number;
  scaleZ?: number;
  yaw?: number;
}

interface MovingNode {
  object: THREE.Object3D;
  baseX: number;
  baseY: number;
  baseZ: number;
  speedFactor: number;
}

type RailwayGroup = THREE.Group & {
  userData: THREE.Group["userData"] & {
    loopLength: number;
    travelSpeed: number;
    travelDistance: number;
    elapsedSeconds: number;
    motionBatches: THREE.InstancedMesh[];
    motionNodes: MovingNode[];
  };
};

function addMesh(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  name: string,
  role: string,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.userData.role = role;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  parent.add(mesh);
  return mesh;
}

function instanceMatrix(transform: InstanceTransform, distance = 0, loopLength = RAILWAY_LAYOUT.loopLength): THREE.Matrix4 {
  const object = new THREE.Object3D();
  object.position.set(wrapX(transform.baseX - distance * transform.speedFactor, loopLength), transform.y, transform.z);
  object.rotation.y = transform.yaw ?? 0;
  object.scale.set(transform.scaleX ?? 1, transform.scaleY ?? 1, transform.scaleZ ?? 1);
  object.updateMatrix();
  return object.matrix;
}

function addMovingInstances(
  parent: THREE.Group,
  batches: THREE.InstancedMesh[],
  name: string,
  role: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  transforms: InstanceTransform[],
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, transforms.length);
  mesh.name = name;
  mesh.userData.role = role;
  mesh.userData.motionInstances = transforms;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  transforms.forEach((transform, index) => mesh.setMatrixAt(index, instanceMatrix(transform)));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  parent.add(mesh);
  batches.push(mesh);
  return mesh;
}

function addMovingNode(
  parent: THREE.Group,
  nodes: MovingNode[],
  object: THREE.Object3D,
  baseX: number,
  y: number,
  z: number,
  speedFactor = 1,
): void {
  object.position.set(baseX, y, z);
  parent.add(object);
  nodes.push({ object, baseX, baseY: y, baseZ: z, speedFactor });
}

export function wrapX(x: number, loopLength: number = RAILWAY_LAYOUT.loopLength): number {
  const half = loopLength / 2;
  return ((((x + half) % loopLength) + loopLength) % loopLength) - half;
}

/** Builds the scenery outside the train; its moving pieces are advanced by TrainMotionEffects. */
export function createRailwayEnvironment(): THREE.Group {
  const environment = new THREE.Group() as RailwayGroup;
  environment.name = "railway-environment";
  const motionBatches: THREE.InstancedMesh[] = [];
  const motionNodes: MovingNode[] = [];
  Object.assign(environment.userData, {
    loopLength: RAILWAY_LAYOUT.loopLength,
    travelSpeed: RAILWAY_LAYOUT.travelSpeed,
    travelDistance: 0,
    elapsedSeconds: 0,
    motionBatches,
    motionNodes,
  });

  const ground = addMesh(
    environment,
    new THREE.PlaneGeometry(RAILWAY_LAYOUT.loopLength, 28),
    new THREE.MeshStandardMaterial({ color: "#101923", roughness: 1 }),
    "night-ground",
    "railway-ground",
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.48;

  const trackBedMaterial = new THREE.MeshStandardMaterial({ color: "#283139", roughness: 0.98 });
  const steel = new THREE.MeshStandardMaterial({ color: "#a8b5bf", metalness: 0.84, roughness: 0.34 });
  const sleeperMaterial = new THREE.MeshStandardMaterial({ color: "#493e39", roughness: 0.94 });
  const ballastMaterial = new THREE.MeshStandardMaterial({ color: "#3b4145", roughness: 1 });
  const railCenterOffsets = [-RAILWAY_LAYOUT.railGauge / 2, RAILWAY_LAYOUT.railGauge / 2];
  const halfLoop = RAILWAY_LAYOUT.loopLength / 2;

  for (const side of [-1, 1]) {
    const centerZ = side * RAILWAY_LAYOUT.trackCenterOffset;
    const bed = addMesh(
      environment,
      new THREE.PlaneGeometry(RAILWAY_LAYOUT.loopLength, 3.15),
      trackBedMaterial,
      `ballast-bed-${side < 0 ? "north" : "south"}`,
      "ballast-bed",
    );
    bed.rotation.x = -Math.PI / 2;
    bed.position.set(0, -0.265, centerZ);

    const sleepers: InstanceTransform[] = [];
    const ballastPatches: InstanceTransform[] = [];
    for (let index = 0; index < RAILWAY_LAYOUT.sleeperCount; index += 1) {
      const baseX = -halfLoop + RAILWAY_LAYOUT.sleeperSpacing / 2 + index * RAILWAY_LAYOUT.sleeperSpacing;
      sleepers.push({ baseX, y: -0.105, z: centerZ, speedFactor: 1 });
      ballastPatches.push({ baseX, y: -0.18, z: centerZ, speedFactor: 1 });
    }
    addMovingInstances(
      environment,
      motionBatches,
      `sleepers-${side < 0 ? "north" : "south"}`,
      "sleeper-batch",
      new THREE.BoxGeometry(0.38, 0.16, 2.65),
      sleeperMaterial,
      sleepers,
    );
    addMovingInstances(
      environment,
      motionBatches,
      `ballast-patches-${side < 0 ? "north" : "south"}`,
      "ballast-patch-batch",
      new THREE.BoxGeometry(1.45, 0.055, 2.92),
      ballastMaterial,
      ballastPatches,
    );

    const rails: InstanceTransform[] = [];
    const segmentCount = RAILWAY_LAYOUT.loopLength / RAILWAY_LAYOUT.railSegmentLength;
    for (let segment = 0; segment < segmentCount; segment += 1) {
      const baseX = -halfLoop + RAILWAY_LAYOUT.railSegmentLength / 2 + segment * RAILWAY_LAYOUT.railSegmentLength;
      for (const offset of railCenterOffsets) {
        rails.push({ baseX, y: -0.01, z: centerZ + offset, speedFactor: 1 });
      }
    }
    addMovingInstances(
      environment,
      motionBatches,
      `steel-rails-${side < 0 ? "north" : "south"}`,
      "rail-batch",
      new THREE.BoxGeometry(RAILWAY_LAYOUT.railSegmentLength, 0.15, 0.17),
      steel,
      rails,
    );
  }

  const treeTrunks: InstanceTransform[] = [];
  const treeCanopies: InstanceTransform[] = [];
  for (const side of [-1, 1]) {
    for (let index = 0; index < 8; index += 1) {
      const baseX = -31.5 + index * 9;
      const z = side * 9.55;
      treeTrunks.push({ baseX, y: -0.02, z, speedFactor: 0.72 });
      treeCanopies.push({ baseX, y: 0.22, z, speedFactor: 0.72, scaleX: 0.82, scaleY: 0.28, scaleZ: 0.82 });
      treeCanopies.push({ baseX, y: 0.29, z: z - side * 0.32, speedFactor: 0.72, scaleX: 0.52, scaleY: 0.22, scaleZ: 0.56 });
    }
  }
  addMovingInstances(
    environment,
    motionBatches,
    "trackside-tree-trunks",
    "railway-tree-trunk-batch",
    new THREE.CylinderGeometry(0.14, 0.2, 0.52, 7),
    new THREE.MeshStandardMaterial({ color: "#3c3532", roughness: 1 }),
    treeTrunks,
  );
  addMovingInstances(
    environment,
    motionBatches,
    "trackside-tree-canopies",
    "railway-tree-batch",
    new THREE.IcosahedronGeometry(1, 1),
    new THREE.MeshStandardMaterial({ color: "#162d29", roughness: 1, flatShading: true }),
    treeCanopies,
  );

  const poles: InstanceTransform[] = [];
  const lampCaps: InstanceTransform[] = [];
  const bulbs: InstanceTransform[] = [];
  for (const side of [-1, 1]) {
    for (let index = 0; index < 6; index += 1) {
      const baseX = -30 + index * 12;
      const z = side * 8.05;
      poles.push({ baseX, y: 0.52, z, speedFactor: 1 });
      lampCaps.push({ baseX, y: 1.22, z, speedFactor: 1 });
      bulbs.push({ baseX, y: 1.29, z: z - side * 0.4, speedFactor: 1, scaleX: 0.21, scaleY: 0.16, scaleZ: 0.21 });
      if (index % 2 === 0) {
        const light = new THREE.PointLight("#ffcf91", 1.35, 5.2, 2);
        light.name = `passing-track-light-${side}-${index}`;
        light.userData.role = "trackside-light";
        light.castShadow = false;
        addMovingNode(environment, motionNodes, light, baseX, 1.27, z - side * 0.4, 1);
      }
    }
  }
  addMovingInstances(
    environment,
    motionBatches,
    "trackside-poles",
    "railway-pole-batch",
    new THREE.CylinderGeometry(0.07, 0.12, 1.35, 8),
    new THREE.MeshStandardMaterial({ color: "#596572", metalness: 0.58, roughness: 0.52 }),
    poles,
  );
  addMovingInstances(
    environment,
    motionBatches,
    "trackside-lamp-caps",
    "railway-pole-cap-batch",
    new THREE.BoxGeometry(0.42, 0.11, 0.16),
    new THREE.MeshStandardMaterial({ color: "#8292a0", metalness: 0.55, roughness: 0.48 }),
    lampCaps,
  );
  addMovingInstances(
    environment,
    motionBatches,
    "trackside-lamp-bulbs",
    "trackside-light-batch",
    new THREE.SphereGeometry(1, 10, 8),
    new THREE.MeshStandardMaterial({ color: "#ffd7a0", emissive: "#db8c40", emissiveIntensity: 1.25, roughness: 0.36 }),
    bulbs,
  );

  const shrubs: InstanceTransform[] = [];
  const distantHills: InstanceTransform[] = [];
  for (const side of [-1, 1]) {
    for (let index = 0; index < 24; index += 1) {
      const baseX = -34.5 + index * 3;
      const z = side * (8.65 + (index % 3) * 0.28);
      const size = 0.34 + (index % 4) * 0.08;
      shrubs.push({ baseX, y: -0.24, z, speedFactor: 0.36, scaleX: size, scaleY: 0.2, scaleZ: size * 0.72, yaw: (index % 4) * 0.35 });
    }
    for (let index = 0; index < 4; index += 1) {
      distantHills.push({ baseX: -27 + index * 18, y: -0.35, z: side * 11.4, speedFactor: 0.16, scaleX: 3.4, scaleY: 0.12, scaleZ: 1.08, yaw: (index % 2) * 0.18 });
    }
  }
  addMovingInstances(
    environment,
    motionBatches,
    "passing-trackside-terrain",
    "trackside-terrain-batch",
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ color: "#23332f", roughness: 1, flatShading: true }),
    shrubs,
  );
  addMovingInstances(
    environment,
    motionBatches,
    "distant-night-hills",
    "distant-hill-batch",
    new THREE.IcosahedronGeometry(1, 1),
    new THREE.MeshStandardMaterial({ color: "#111d2b", roughness: 1, flatShading: true }),
    distantHills,
  );

  return environment;
}
