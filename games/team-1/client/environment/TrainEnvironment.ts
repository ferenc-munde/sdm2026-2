import * as THREE from "three";
import { trainMaterials } from "./materials";

const SECTION_LENGTH = 5.2;
const TRAIN_WIDTH = 10;
const WALL_HEIGHT = 0.62;
const WALL_THICKNESS = 0.24;
const DOOR_WIDTH = 2.1;
const SECTION_COUNT = 5;
const TRAIN_LENGTH = SECTION_LENGTH * SECTION_COUNT;

export const TRAIN_LAYOUT = {
  length: TRAIN_LENGTH,
  width: TRAIN_WIDTH,
} as const;

type SectionId = "engine" | "electrical" | "control" | "passenger" | "rear";

interface SectionDefinition {
  id: SectionId;
  title: string;
  floor: THREE.Material;
  equipment: (section: THREE.Group) => void;
}

function addBox(
  parent: THREE.Group,
  name: string,
  position: THREE.Vector3,
  size: THREE.Vector3,
  material: THREE.Material,
  role: string,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material);
  mesh.name = name;
  mesh.position.copy(position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.role = role;
  parent.add(mesh);
  return mesh;
}

function addCylinder(
  parent: THREE.Group,
  name: string,
  position: THREE.Vector3,
  radius: number,
  height: number,
  material: THREE.Material,
  role: string,
  radialSegments = 16,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, radialSegments),
    material,
  );
  mesh.name = name;
  mesh.position.copy(position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.role = role;
  parent.add(mesh);
  return mesh;
}

function addSectionFloor(
  section: THREE.Group,
  material: THREE.Material,
): void {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(SECTION_LENGTH, TRAIN_WIDTH),
    material,
  );
  floor.name = `${section.name}-floor`;
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.015;
  floor.receiveShadow = true;
  floor.userData.role = "floor";
  section.add(floor);
}

function buildEngineRoom(section: THREE.Group): void {
  addBox(
    section,
    "engine-generator",
    new THREE.Vector3(-0.15, 0.48, -3.25),
    new THREE.Vector3(3.1, 0.82, 2.05),
    trainMaterials.engine,
    "equipment",
  );
  addCylinder(
    section,
    "engine-generator-cap",
    new THREE.Vector3(-0.15, 1.02, -3.25),
    0.62,
    0.28,
    trainMaterials.darkMetal,
    "equipment",
  );
  addBox(
    section,
    "engine-service-console",
    new THREE.Vector3(0, 0.42, 3.35),
    new THREE.Vector3(2.7, 0.7, 1.7),
    trainMaterials.darkMetal,
    "equipment",
  );
  addCylinder(
    section,
    "engine-exhaust-stack",
    new THREE.Vector3(1.35, 0.75, -3.2),
    0.32,
    0.7,
    trainMaterials.metal,
    "equipment",
  );
  addBox(
    section,
    "engine-warning-stripe",
    new THREE.Vector3(0, 0.035, 0),
    new THREE.Vector3(0.12, 0.025, 8.6),
    trainMaterials.floorMarking,
    "floor-marking",
  );
}

function buildElectricalRoom(section: THREE.Group): void {
  for (let index = 0; index < 3; index += 1) {
    const x = -1.55 + index * 1.55;
    for (const z of [-3.65, 3.65]) {
      const cabinet = addBox(
        section,
        `electrical-cabinet-${index + 1}-${z < 0 ? "north" : "south"}`,
        new THREE.Vector3(x, 0.55, z),
        new THREE.Vector3(1.15, 1.05, 1.45),
        trainMaterials.electrical,
        "equipment",
      );
      cabinet.userData.interactiveTarget = true;
      addBox(
        section,
        `${cabinet.name}-panel`,
        new THREE.Vector3(x, 1.1, z + (z < 0 ? 0.74 : -0.74)),
        new THREE.Vector3(0.62, 0.3, 0.08),
        trainMaterials.metal,
        "equipment-detail",
      );
    }
  }
  addBox(
    section,
    "electrical-cable-tray",
    new THREE.Vector3(0, 0.08, 0),
    new THREE.Vector3(0.22, 0.04, 8.8),
    trainMaterials.darkMetal,
    "floor-detail",
  );
}

function buildControlCabin(section: THREE.Group): void {
  addBox(
    section,
    "control-console",
    new THREE.Vector3(0, 0.48, -3.45),
    new THREE.Vector3(3.7, 0.88, 1.35),
    trainMaterials.darkMetal,
    "equipment",
  );
  addBox(
    section,
    "control-console-screen",
    new THREE.Vector3(0, 1.01, -3.45),
    new THREE.Vector3(2.65, 0.18, 0.82),
    trainMaterials.control,
    "equipment-detail",
  );
  addCylinder(
    section,
    "control-chair-seat",
    new THREE.Vector3(0, 0.42, 2.4),
    0.58,
    0.28,
    trainMaterials.seat,
    "furniture",
  );
  const wheel = new THREE.Mesh(
    new THREE.TorusGeometry(0.48, 0.075, 8, 24),
    trainMaterials.wallTrim,
  );
  wheel.name = "control-brake-wheel";
  wheel.position.set(0, 0.78, 0.35);
  wheel.rotation.x = Math.PI / 2;
  wheel.castShadow = true;
  wheel.userData.role = "equipment";
  wheel.userData.interactiveTarget = true;
  section.add(wheel);
  addBox(
    section,
    "control-cabin-floor-stripe",
    new THREE.Vector3(0, 0.035, 1.45),
    new THREE.Vector3(3.9, 0.025, 0.12),
    trainMaterials.floorMarking,
    "floor-marking",
  );
}

function buildPassengerCarriage(section: THREE.Group): void {
  for (let index = 0; index < 3; index += 1) {
    const x = -1.55 + index * 1.55;
    for (const side of [-1, 1]) {
      const z = side * 3.15;
      addBox(
        section,
        `passenger-seat-${index + 1}-${side < 0 ? "north" : "south"}`,
        new THREE.Vector3(x, 0.34, z),
        new THREE.Vector3(1.25, 0.38, 1.25),
        trainMaterials.seat,
        "furniture",
      );
      addBox(
        section,
        `passenger-seat-base-${index + 1}-${side < 0 ? "north" : "south"}`,
        new THREE.Vector3(x, 0.14, z),
        new THREE.Vector3(1.35, 0.2, 1.35),
        trainMaterials.seatBase,
        "furniture",
      );
      addBox(
        section,
        `passenger-seat-back-${index + 1}-${side < 0 ? "north" : "south"}`,
        new THREE.Vector3(x, 0.66, z + side * 0.56),
        new THREE.Vector3(1.25, 0.72, 0.16),
        trainMaterials.seat,
        "furniture",
      );
    }
  }
  addBox(
    section,
    "passenger-aisle-runner",
    new THREE.Vector3(0, 0.035, 0),
    new THREE.Vector3(4.9, 0.025, 1.45),
    trainMaterials.floorMarking,
    "floor-marking",
  );
}

function buildRearBrakeRoom(section: THREE.Group): void {
  for (const x of [-1.35, 1.35]) {
    addCylinder(
      section,
      `brake-air-reservoir-${x < 0 ? "left" : "right"}`,
      new THREE.Vector3(x, 0.48, -3.15),
      0.8,
      1.5,
      trainMaterials.brake,
      "equipment",
      20,
    );
    addBox(
      section,
      `brake-control-cabinet-${x < 0 ? "left" : "right"}`,
      new THREE.Vector3(x, 0.42, 3.25),
      new THREE.Vector3(1.25, 0.72, 1.7),
      trainMaterials.darkMetal,
      "equipment",
    );
  }
  addCylinder(
    section,
    "rear-brake-wheel-hub",
    new THREE.Vector3(0, 0.42, 0),
    0.42,
    0.45,
    trainMaterials.wallTrim,
    "equipment",
  );
  const wheel = new THREE.Mesh(
    new THREE.TorusGeometry(0.85, 0.1, 8, 24),
    trainMaterials.brake,
  );
  wheel.name = "rear-brake-handwheel";
  wheel.position.set(0, 0.68, 0);
  wheel.rotation.x = Math.PI / 2;
  wheel.castShadow = true;
  wheel.userData.role = "equipment";
  wheel.userData.interactiveTarget = true;
  section.add(wheel);
}

const sections: SectionDefinition[] = [
  {
    id: "engine",
    title: "Engine Room",
    floor: trainMaterials.floors.engine,
    equipment: buildEngineRoom,
  },
  {
    id: "electrical",
    title: "Electrical Room",
    floor: trainMaterials.floors.electrical,
    equipment: buildElectricalRoom,
  },
  {
    id: "control",
    title: "Control Cabin",
    floor: trainMaterials.floors.control,
    equipment: buildControlCabin,
  },
  {
    id: "passenger",
    title: "Passenger Carriage",
    floor: trainMaterials.floors.passenger,
    equipment: buildPassengerCarriage,
  },
  {
    id: "rear",
    title: "Rear Carriage / Braking System",
    floor: trainMaterials.floors.rear,
    equipment: buildRearBrakeRoom,
  },
];

function addWalls(environment: THREE.Group): void {
  const walls = new THREE.Group();
  walls.name = "train-walls";
  walls.userData.role = "collision-boundary";
  environment.add(walls);

  const halfLength = TRAIN_LENGTH / 2;
  const halfWidth = TRAIN_WIDTH / 2;
  const wallY = WALL_HEIGHT / 2;

  addBox(
    walls,
    "outer-wall-north",
    new THREE.Vector3(0, wallY, -halfWidth),
    new THREE.Vector3(TRAIN_LENGTH, WALL_HEIGHT, WALL_THICKNESS),
    trainMaterials.wall,
    "collision-boundary",
  );
  addBox(
    walls,
    "outer-wall-south",
    new THREE.Vector3(0, wallY, halfWidth),
    new THREE.Vector3(TRAIN_LENGTH, WALL_HEIGHT, WALL_THICKNESS),
    trainMaterials.wall,
    "collision-boundary",
  );
  addBox(
    walls,
    "outer-wall-front",
    new THREE.Vector3(-halfLength, wallY, 0),
    new THREE.Vector3(WALL_THICKNESS, WALL_HEIGHT, TRAIN_WIDTH),
    trainMaterials.wall,
    "collision-boundary",
  );
  addBox(
    walls,
    "outer-wall-rear",
    new THREE.Vector3(halfLength, wallY, 0),
    new THREE.Vector3(WALL_THICKNESS, WALL_HEIGHT, TRAIN_WIDTH),
    trainMaterials.wall,
    "collision-boundary",
  );

  const partitionSegmentWidth = (TRAIN_WIDTH - DOOR_WIDTH) / 2;
  for (let index = 1; index < SECTION_COUNT; index += 1) {
    const x = -halfLength + SECTION_LENGTH * index;
    const partition = new THREE.Group();
    partition.name = `doorway-${sections[index - 1].id}-to-${sections[index].id}`;
    partition.userData.role = "collision-boundary";
    partition.userData.doorwayWidth = DOOR_WIDTH;
    walls.add(partition);

    for (const side of [-1, 1]) {
      const z = side * (DOOR_WIDTH / 2 + partitionSegmentWidth / 2);
      addBox(
        partition,
        `partition-wall-${side < 0 ? "north" : "south"}`,
        new THREE.Vector3(x, wallY, z),
        new THREE.Vector3(WALL_THICKNESS, WALL_HEIGHT, partitionSegmentWidth),
        trainMaterials.wall,
        "collision-boundary",
      );
      addBox(
        partition,
        `door-frame-${side < 0 ? "north" : "south"}`,
        new THREE.Vector3(x, wallY, side * DOOR_WIDTH / 2),
        new THREE.Vector3(WALL_THICKNESS * 1.5, WALL_HEIGHT, 0.12),
        trainMaterials.wallTrim,
        "door-frame",
      );
    }
    addBox(
      partition,
      "doorway-threshold",
      new THREE.Vector3(x, 0.035, 0),
      new THREE.Vector3(WALL_THICKNESS, 0.04, DOOR_WIDTH),
      trainMaterials.darkMetal,
      "doorway-threshold",
    );
  }
}

function addRepairMarkers(environment: THREE.Group): void {
  sections.forEach((definition, index) => {
    const marker = new THREE.Group();
    marker.name = `repair-area-${definition.id}`;
    marker.position.set(-TRAIN_LENGTH / 2 + SECTION_LENGTH * (index + 0.5), 0, 0);
    marker.userData.role = "repair-area";
    marker.userData.sectionId = definition.id;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.66, 0.78, 32),
      new THREE.MeshBasicMaterial({ color: "#e8bd72", transparent: true, opacity: 0.82, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.07;
    ring.userData.role = "repair-area-marker";
    marker.add(ring);
    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 0.32, 8),
      new THREE.MeshStandardMaterial({ color: "#e8bd72", emissive: "#7c4f1d", emissiveIntensity: 0.7 }),
    );
    beacon.position.set(0, 0.22, 0);
    beacon.userData.role = "repair-area-beacon";
    marker.add(beacon);
    environment.add(marker);
  });
}

export function createTrainEnvironment(): THREE.Group {
  const environment = new THREE.Group();
  environment.name = "train-environment";
  environment.userData.role = "train-environment";
  environment.userData.sectionCount = sections.length;

  sections.forEach((definition, index) => {
    const section = new THREE.Group();
    section.name = definition.title;
    section.position.x = -TRAIN_LENGTH / 2 + SECTION_LENGTH * (index + 0.5);
    section.userData.sectionId = definition.id;
    section.userData.role = "train-section";
    section.userData.length = SECTION_LENGTH;
    section.userData.width = TRAIN_WIDTH;
    environment.add(section);

    addSectionFloor(section, definition.floor);
    definition.equipment(section);
  });

  addWalls(environment);
  addRepairMarkers(environment);
  return environment;
}
