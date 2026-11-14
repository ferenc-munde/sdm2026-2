import * as THREE from "three";
import { SECTIONS, TASK_CATALOGUE, TRAIN_SIZE, type SectionId } from "../../shared/train-layout";

type RepairStationTask = {
  id: string;
  section?: SectionId;
  status: "available" | "in-progress" | "complete";
  progress: number;
  calibrationStep?: number;
};

type StationLook = {
  label: string;
  offsetZ: number;
  buildDetail: (station: THREE.Group, visual: StationVisual) => void;
};

type StationVisual = {
  group: THREE.Group;
  section: SectionId;
  ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshStandardMaterial>;
  beacon: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshStandardMaterial>;
  label?: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  statusLights: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>[];
  progressLights: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>[];
  switches: THREE.Group[];
  needles: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>[];
  brakeStepLights: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshStandardMaterial>[];
  brakeLever?: THREE.Group;
  passengerLamps: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>[];
  status: RepairStationTask["status"] | "not-in-run";
  canRepair: boolean;
};

export type RepairStationsController = {
  group: THREE.Group;
  update(tasks: readonly RepairStationTask[], currentSection?: SectionId): void;
  animate(deltaSeconds: number): void;
};

const LOOKS: Record<string, StationLook> = {
  boiler: { label: "BOILER", offsetZ: 1.05, buildDetail: buildBoilerDetail },
  wiring: { label: "WIRES", offsetZ: 1.15, buildDetail: buildWiringDetail },
  instruments: { label: "INSTR", offsetZ: -1.45, buildDetail: buildInstrumentDetail },
  "passenger-lights": { label: "LIGHTS", offsetZ: 1.05, buildDetail: buildPassengerLightDetail },
  brakes: { label: "BRAKES", offsetZ: -1.45, buildDetail: buildBrakeDetail },
};

const FONT: Record<string, readonly string[]> = {
  A: ["010", "101", "111", "101", "101"],
  B: ["110", "101", "110", "101", "110"],
  C: ["011", "100", "100", "100", "011"],
  E: ["111", "100", "110", "100", "111"],
  G: ["011", "100", "101", "101", "011"],
  H: ["101", "101", "111", "101", "101"],
  I: ["111", "010", "010", "010", "111"],
  K: ["101", "101", "110", "101", "101"],
  L: ["100", "100", "100", "100", "111"],
  N: ["101", "111", "111", "111", "101"],
  O: ["010", "101", "101", "101", "010"],
  R: ["110", "101", "110", "101", "101"],
  S: ["011", "100", "010", "001", "110"],
  T: ["111", "010", "010", "010", "010"],
  W: ["101", "101", "101", "111", "101"],
};

const palette = {
  idle: "#e05b4f",
  active: "#6ed0cf",
  complete: "#78d6a0",
  absent: "#59636b",
  dark: "#273239",
  metal: "#89999c",
  text: "#f4dfb2",
} as const;

function addMesh<T extends THREE.BufferGeometry, M extends THREE.Material>(
  parent: THREE.Group,
  name: string,
  geometry: T,
  material: M,
  position: THREE.Vector3,
  role: string,
): THREE.Mesh<T, M> {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.copy(position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.role = role;
  parent.add(mesh);
  return mesh;
}

function box(
  parent: THREE.Group,
  name: string,
  size: [number, number, number],
  position: [number, number, number],
  color: string,
  role: string,
  emissive = "#000000",
): THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial> {
  return addMesh(
    parent,
    name,
    new THREE.BoxGeometry(...size),
    new THREE.MeshStandardMaterial({ color, roughness: 0.58, metalness: 0.42, emissive, emissiveIntensity: 0.35 }),
    new THREE.Vector3(...position),
    role,
  );
}

function cylinder(
  parent: THREE.Group,
  name: string,
  radius: number,
  height: number,
  position: [number, number, number],
  color: string,
  role: string,
  emissive = "#000000",
): THREE.Mesh<THREE.CylinderGeometry, THREE.MeshStandardMaterial> {
  return addMesh(
    parent,
    name,
    new THREE.CylinderGeometry(radius, radius, height, 16),
    new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.48, emissive, emissiveIntensity: 0.45 }),
    new THREE.Vector3(...position),
    role,
  );
}

function createPixelLabel(text: string): THREE.BufferGeometry {
  const cell = 0.07;
  const dot = 0.052;
  const advance = cell * 4;
  const width = Math.max(0, text.length * advance - cell);
  const vertices: number[] = [];

  for (let characterIndex = 0; characterIndex < text.length; characterIndex += 1) {
    const glyph = FONT[text[characterIndex] ?? ""];
    if (!glyph) continue;
    for (let row = 0; row < glyph.length; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        if (glyph[row]?.[column] !== "1") continue;
        const x = characterIndex * advance + column * cell - width / 2;
        const z = row * cell - (glyph.length * cell) / 2;
        // Winding points upward so the label reads from the game's overhead camera.
        vertices.push(
          x, 0, z, x, 0, z + dot, x + dot, 0, z + dot,
          x, 0, z, x + dot, 0, z + dot, x + dot, 0, z,
        );
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function addConsole(station: THREE.Group, visual: StationVisual, labelText: string): void {
  for (const x of [-0.88, 0.88]) {
    for (const z of [-0.47, 0.47]) {
      box(station, `station-leg-${x}-${z}`, [0.12, 0.2, 0.12], [x, 0.13, z], "#58666b", "station-detail");
    }
  }

  box(station, "station-console", [2.42, 0.42, 1.42], [0, 0.31, 0], palette.dark, "station-console", "#102125");
  box(station, "station-console-top", [2.2, 0.035, 1.2], [0, 0.54, 0], "#526168", "station-detail");
  const label = addMesh(
    station,
    `station-label-${labelText.toLowerCase()}`,
    createPixelLabel(labelText),
    new THREE.MeshBasicMaterial({ color: palette.text, side: THREE.DoubleSide, toneMapped: false }),
    new THREE.Vector3(0, 0.57, -0.43),
    "station-label",
  );
  label.userData.text = labelText;
  visual.label = label;

  for (let index = 0; index < 10; index += 1) {
    const x = -0.88 + index * 0.195;
    const led = box(station, `station-progress-${index + 1}`, [0.12, 0.04, 0.1], [x, 0.59, 0.42], "#34454b", "station-progress-led");
    led.userData.step = index + 1;
    visual.progressLights.push(led);
  }

  for (let index = 0; index < 3; index += 1) {
    const light = addMesh(
      station,
      `station-status-light-${index + 1}`,
      new THREE.SphereGeometry(0.09, 12, 10),
      new THREE.MeshStandardMaterial({ color: palette.idle, emissive: palette.idle, emissiveIntensity: 0.85 }),
      new THREE.Vector3(-0.72 + index * 0.72, 0.66, 0.08),
      "station-status-light",
    );
    visual.statusLights.push(light);
  }
}

function addGauge(station: THREE.Group, x: number, z: number, name: string): THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial> {
  cylinder(station, `${name}-face`, 0.3, 0.08, [x, 0.67, z], "#d5c6a5", "station-gauge");
  const bezel = addMesh(
    station,
    `${name}-bezel`,
    new THREE.TorusGeometry(0.3, 0.045, 8, 24),
    new THREE.MeshStandardMaterial({ color: palette.metal, metalness: 0.6, roughness: 0.4 }),
    new THREE.Vector3(x, 0.71, z),
    "station-gauge-bezel",
  );
  bezel.rotation.x = -Math.PI / 2;
  const needle = box(station, `${name}-needle`, [0.035, 0.025, 0.23], [x, 0.73, z], "#b8443f", "station-gauge-needle");
  needle.userData.targetRotation = 0;
  return needle;
}

function buildBoilerDetail(station: THREE.Group, visual: StationVisual): void {
  for (const x of [-0.74, 0.74]) {
    const pipe = cylinder(station, `boiler-pipe-${x}`, 0.09, 0.64, [x, 0.68, 0.08], "#bd7648", "station-pipe");
    pipe.rotation.z = Math.PI / 2;
  }
  visual.needles.push(addGauge(station, 0, 0.08, "boiler-pressure-gauge"));
}

function buildWiringDetail(station: THREE.Group, visual: StationVisual): void {
  for (let index = 0; index < 4; index += 1) {
    const x = -0.75 + index * 0.5;
    const switchRoot = new THREE.Group();
    switchRoot.name = `wire-switch-${index + 1}`;
    switchRoot.position.set(x, 0.61, 0.08);
    switchRoot.userData.targetRotation = -0.38;
    switchRoot.userData.role = "station-switch";
    station.add(switchRoot);
    cylinder(switchRoot, `wire-switch-base-${index + 1}`, 0.13, 0.07, [0, 0, 0], "#20292d", "station-detail");
    box(switchRoot, `wire-switch-handle-${index + 1}`, [0.07, 0.29, 0.08], [0, 0.15, 0], "#e06452", "station-switch-handle");
    visual.switches.push(switchRoot);
  }
}

function buildInstrumentDetail(station: THREE.Group, visual: StationVisual): void {
  for (const [index, x] of [-0.68, 0, 0.68].entries()) {
    visual.needles.push(addGauge(station, x, 0.08, `control-instrument-${index + 1}`));
  }
}

function buildPassengerLightDetail(station: THREE.Group, visual: StationVisual): void {
  box(station, "passenger-light-rail", [1.68, 0.09, 0.17], [0, 0.67, 0.06], "#59656a", "station-detail");
  for (let index = 0; index < 3; index += 1) {
    const lamp = box(
      station,
      `passenger-light-${index + 1}`,
      [0.38, 0.08, 0.22],
      [-0.56 + index * 0.56, 0.73, 0.06],
      palette.idle,
      "station-lamp",
      palette.idle,
    );
    visual.passengerLamps.push(lamp);
  }
}

function buildBrakeDetail(station: THREE.Group, visual: StationVisual): void {
  cylinder(station, "brake-lever-pivot", 0.27, 0.13, [0, 0.65, 0.08], "#c18f53", "station-brake-hinge");
  const lever = new THREE.Group();
  lever.name = "brake-calibration-lever";
  lever.position.set(0, 0.69, 0.08);
  lever.userData.targetRotation = -0.34;
  lever.userData.role = "station-brake-lever";
  station.add(lever);
  box(lever, "brake-lever-arm", [0.12, 0.16, 0.6], [0, 0.06, -0.22], "#cf9652", "station-detail");
  cylinder(lever, "brake-lever-grip", 0.12, 0.22, [0, 0.08, -0.52], "#e6c381", "station-detail");
  visual.brakeLever = lever;
  for (let index = 0; index < 3; index += 1) {
    const stepLight = cylinder(station, `brake-sequence-light-${index + 1}`, 0.08, 0.06, [-0.35 + index * 0.35, 0.69, 0.54], palette.idle, "station-brake-step");
    visual.brakeStepLights.push(stepLight);
  }
}

function makeStation(section: SectionId, taskId: string, label: string, x: number, z: number, buildDetail: StationLook["buildDetail"]): StationVisual {
  const station = new THREE.Group();
  station.name = `repair-station-${taskId}`;
  station.position.set(x, 0, z);
  station.userData.role = "repair-area";
  station.userData.sectionId = section;
  station.userData.taskId = taskId;

  const ringMaterial = new THREE.MeshStandardMaterial({
    color: palette.idle,
    emissive: palette.idle,
    emissiveIntensity: 0.72,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
  });
  const ring = addMesh(
    station,
    `repair-marker-${taskId}`,
    new THREE.RingGeometry(0.88, 1, 40),
    ringMaterial,
    new THREE.Vector3(0, 0.075, 0),
    "repair-area-marker",
  );
  ring.rotation.x = -Math.PI / 2;
  ring.scale.set(1.3, 0.88, 1);

  const beacon = addMesh(
    station,
    `repair-beacon-${taskId}`,
    new THREE.CylinderGeometry(0.055, 0.075, 0.46, 10),
    new THREE.MeshStandardMaterial({ color: palette.idle, emissive: palette.idle, emissiveIntensity: 1.05 }),
    new THREE.Vector3(0.98, 0.3, -0.7),
    "repair-area-beacon",
  );
  const visual: StationVisual = {
    group: station,
    section,
    ring,
    beacon,
    statusLights: [],
    progressLights: [],
    switches: [],
    needles: [],
    brakeStepLights: [],
    passengerLamps: [],
    status: "not-in-run",
    canRepair: false,
  };

  const halo = addMesh(
    station,
    `repair-halo-${taskId}`,
    new THREE.CircleGeometry(1.14, 40),
    new THREE.MeshBasicMaterial({ color: palette.idle, transparent: true, opacity: 0.11, side: THREE.DoubleSide, depthWrite: false }),
    new THREE.Vector3(0, 0.055, 0),
    "repair-area-halo",
  );
  halo.scale.set(1.35, 0.88, 1);
  halo.rotation.x = -Math.PI / 2;

  addConsole(station, visual, label);
  buildDetail(station, visual);
  return visual;
}

function stateColor(status: StationVisual["status"]): string {
  if (status === "complete") return palette.complete;
  if (status === "in-progress") return palette.active;
  if (status === "available") return palette.idle;
  return palette.absent;
}

function setStandardMaterial(material: THREE.MeshStandardMaterial, color: string, intensity = 0.8): void {
  material.color.set(color);
  material.emissive.set(color);
  material.emissiveIntensity = intensity;
}

function applyTaskState(visual: StationVisual, task: RepairStationTask | undefined, currentSection?: SectionId): void {
  const status = task?.status ?? "not-in-run";
  const color = stateColor(status);
  const progress = task ? Math.min(100, Math.max(0, task.progress)) : 0;
  const stepCount = task?.id === "brakes" ? Math.min(3, Math.max(0, task.calibrationStep ?? 0)) : Math.round(progress / 10);
  visual.status = status;
  visual.canRepair = status !== "complete" && status !== "not-in-run" && currentSection === visual.section;
  visual.group.userData.status = status;
  visual.group.userData.progress = progress;
  visual.group.userData.canRepair = visual.canRepair;
  visual.group.userData.calibrationStep = task?.calibrationStep ?? 0;

  visual.ring.material.color.set(color);
  visual.ring.material.emissive.set(color);
  visual.beacon.material.color.set(color);
  visual.beacon.material.emissive.set(color);
  visual.label?.material.color.set(status === "not-in-run" ? "#a0abb0" : status === "complete" ? palette.complete : palette.text);

  visual.statusLights.forEach((light, index) => {
    const lightColor = status === "complete" || (status === "in-progress" && index < Math.ceil(progress / 34))
      ? palette.complete
      : status === "not-in-run"
        ? palette.absent
        : palette.idle;
    setStandardMaterial(light.material, lightColor, status === "available" ? 0.72 : 1.1);
  });

  visual.progressLights.forEach((light, index) => {
    const lit = index < Math.ceil(progress / 10) || status === "complete";
    setStandardMaterial(light.material, lit ? (status === "complete" ? palette.complete : palette.active) : "#34454b", lit ? 1 : 0.05);
    light.userData.lit = lit;
  });

  visual.switches.forEach((switchRoot, index) => {
    const handle = switchRoot.children[1] as THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial> | undefined;
    const targetRotation = progress >= (index + 1) * 25 ? 0.38 : -0.38;
    switchRoot.userData.targetRotation = status === "complete" ? 0.38 : targetRotation;
    if (handle) setStandardMaterial(handle.material, progress >= (index + 1) * 25 ? palette.complete : palette.idle, 0.78);
  });

  visual.needles.forEach((needle, index) => {
    needle.userData.targetRotation = -0.72 + (progress / 100) * 1.44 + index * 0.06;
  });

  if (visual.brakeLever) {
    const calibration = Math.min(3, Math.max(0, task?.calibrationStep ?? 0));
    visual.brakeLever.userData.targetRotation = -0.34 + (calibration / 3) * 0.68;
    visual.brakeStepLights.forEach((light, index) => {
      setStandardMaterial(light.material, index < calibration ? palette.complete : palette.idle, index < calibration ? 1.1 : 0.55);
    });
  }

  visual.passengerLamps.forEach((lamp, index) => {
    const lit = status === "complete" || (status === "in-progress" && index < Math.ceil(progress / 34));
    setStandardMaterial(lamp.material, lit ? palette.complete : status === "not-in-run" ? palette.absent : palette.idle, lit ? 1.2 : 0.35);
  });
}

export function createRepairStations(): RepairStationsController {
  const group = new THREE.Group();
  group.name = "repair-stations";
  group.userData.role = "repair-station-set";
  const sectionLength = TRAIN_SIZE.length / SECTIONS.length;
  const visuals: StationVisual[] = [];

  SECTIONS.forEach((section, index) => {
    const task = TASK_CATALOGUE.find((definition) => definition.section === section);
    if (!task) return;
    const look = LOOKS[task.id];
    if (!look) return;
    const x = -TRAIN_SIZE.length / 2 + sectionLength * (index + 0.5);
    const visual = makeStation(section, task.id, look.label, x, look.offsetZ, look.buildDetail);
    visuals.push(visual);
    group.add(visual.group);
  });

  let animationTime = 0;
  return {
    group,
    update(tasks, currentSection) {
      visuals.forEach((visual) => {
        const task = tasks.find((candidate) => candidate.id === visual.group.userData.taskId);
        applyTaskState(visual, task, currentSection);
      });
    },
    animate(deltaSeconds) {
      const delta = Math.min(0.1, Math.max(0, deltaSeconds));
      animationTime += delta;
      const smoothing = 1 - Math.exp(-9 * delta);
      visuals.forEach((visual, index) => {
        const pulse = 0.96 + Math.sin(animationTime * 2.3 + index * 1.2) * 0.08;
        visual.beacon.scale.y = visual.status === "complete" ? pulse * 1.12 : pulse;
        visual.beacon.rotation.y += delta * (visual.status === "complete" ? 0.75 : 0.22);
        visual.ring.material.opacity = visual.canRepair ? 0.85 + Math.sin(animationTime * 4) * 0.12 : 0.62;
        for (const switchRoot of visual.switches) {
          const target = switchRoot.userData.targetRotation as number;
          switchRoot.rotation.z += (target - switchRoot.rotation.z) * smoothing;
        }
        for (const needle of visual.needles) {
          const target = needle.userData.targetRotation as number;
          needle.rotation.y += (target - needle.rotation.y) * smoothing;
        }
        if (visual.brakeLever) {
          const target = visual.brakeLever.userData.targetRotation as number;
          visual.brakeLever.rotation.x += (target - visual.brakeLever.rotation.x) * smoothing;
        }
      });
    },
  };
}
