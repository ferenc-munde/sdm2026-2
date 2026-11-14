// The platform scene for the waiting room (#146).
//
// Draws the lobby platform from `shared/map/platform.ts` with the same box shape
// as the train map: floor, walls, the platform objects from #153, and the crew
// waiting before departure.

import {
  AmbientLight,
  BoxGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  type Object3D,
} from "three";
import { createPlatformMap, type PlatformMap } from "../shared/map/platform.ts";
import { advanceWalk, crewPose, smoothSpeed, speedBetween } from "./crewPose.ts";
import type { RenderPlayer } from "./renderPlayer.ts";
import {
  PLAYER_COLORS,
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
  createNameLabel,
  reconcile,
  type Drawn,
  type LabelFactory,
} from "./trainScene.ts";

const FLOOR_THICKNESS = 8;
const WALL_HEIGHT = 30;
const FLOOR_COLOR = "#2a2a33";
const WALL_COLOR = "#71717f";
const DOOR_COLOR = "#c9a227";
const CAMERA_ELEVATION_DEGREES = 55;
const CAMERA_MARGIN = 120;

export interface PlatformSceneOptions {
  map?: PlatformMap;
  labelFactory?: LabelFactory;
}

export interface PlatformScene {
  scene: Scene;
  camera: PerspectiveCamera;
  playersGroup: Group;
  mapGroup: Group;
  map: PlatformMap;
  updatePlayers(players: readonly RenderPlayer[]): void;
  /** Walk/idle bob for the waiting crew (#294); call after `updatePlayers`. */
  updateMotion(dt: number): void;
  dispose(): void;
}

/** Fits the camera so the whole platform is visible from above at an angle. */
export function fitCameraToPlatform(camera: PerspectiveCamera, map: PlatformMap, aspect: number): void {
  const halfFov = (camera.fov * Math.PI) / 180 / 2;
  const widthToFit = map.floor.width + CAMERA_MARGIN;
  const depthToFit = map.floor.depth + CAMERA_MARGIN;
  const distanceForWidth = widthToFit / (2 * Math.tan(halfFov) * Math.max(aspect, 0.1));
  const distanceForDepth = depthToFit / (2 * Math.tan(halfFov));
  const distance = Math.max(distanceForWidth, distanceForDepth);
  const elevation = (CAMERA_ELEVATION_DEGREES * Math.PI) / 180;

  camera.aspect = aspect;
  camera.position.set(
    map.floor.x,
    distance * Math.sin(elevation),
    map.floor.y + distance * Math.cos(elevation),
  );
  camera.lookAt(map.floor.x, 0, map.floor.y);
  camera.updateProjectionMatrix();
}

function platformObject(name: string, x: number, y: number): Object3D {
  const group = new Group();
  group.name = `platform-object-${name}`;
  group.userData = { kind: "platformObject", objectName: name };
  group.position.set(x, 0, y);

  const add = (mesh: Mesh, offsetY: number): void => {
    mesh.position.y = offsetY;
    group.add(mesh);
  };

  switch (name) {
    case "coal pile":
      add(new Mesh(new BoxGeometry(40, 16, 40), new MeshStandardMaterial({ color: 0x26262c, roughness: 1 })), 8);
      break;
    case "boiler":
      add(new Mesh(new CylinderGeometry(20, 20, 26, 18), new MeshStandardMaterial({ color: 0xb3541e, roughness: 0.6 })), 13);
      break;
    case "wrench":
      add(new Mesh(new BoxGeometry(18, 8, 18), new MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.5 })), 4);
      break;
    case "breach":
      add(new Mesh(new CylinderGeometry(18, 18, 4, 20), new MeshStandardMaterial({ color: 0x3e63dd })), 2);
      break;
    case "departure lever": {
      add(new Mesh(new BoxGeometry(30, 6, 30), new MeshStandardMaterial({ color: 0x5c5c66 })), 3);
      const post = new Mesh(new BoxGeometry(12, 44, 12), new MeshStandardMaterial({ color: 0xf5d90a }));
      post.position.y = 28;
      group.add(post);
      break;
    }
    default: {
      // How-to-play boards stand against the train wall.
      const board = new Mesh(new BoxGeometry(8, 50, 64), new MeshStandardMaterial({ color: 0x3e63dd }));
      board.position.y = 25;
      group.add(board);
      break;
    }
  }

  return group;
}

function buildMapGroup(map: PlatformMap): Group {
  const group = new Group();
  group.name = "platform";

  const floor = new Mesh(
    new BoxGeometry(map.floor.width, FLOOR_THICKNESS, map.floor.depth),
    new MeshStandardMaterial({ color: new Color(FLOOR_COLOR), roughness: 0.95 }),
  );
  floor.position.set(map.floor.x, -FLOOR_THICKNESS / 2, map.floor.y);
  floor.name = "platform-floor";
  floor.userData = { kind: "platformFloor" };
  group.add(floor);

  const wallMaterial = new MeshStandardMaterial({ color: new Color(WALL_COLOR), roughness: 0.8 });
  for (const wall of map.walls) {
    const mesh = new Mesh(new BoxGeometry(wall.width, WALL_HEIGHT, wall.depth), wallMaterial);
    mesh.position.set(wall.x, WALL_HEIGHT / 2, wall.y);
    mesh.name = "platform-wall";
    mesh.userData = { kind: "wall" };
    group.add(mesh);
  }

  // Our train, doors closed, waiting along the back wall of the platform.
  const trainY = map.floor.y - map.floor.depth / 2 - 20;
  const body = new Mesh(
    new BoxGeometry(map.floor.width, 60, 40),
    new MeshStandardMaterial({ color: 0x3a3a44, roughness: 0.8 }),
  );
  body.position.set(map.floor.x, 30, trainY);
  body.name = "platform-train";
  body.userData = { kind: "platformTrain" };
  group.add(body);

  const doorMaterial = new MeshStandardMaterial({ color: new Color(DOOR_COLOR), roughness: 0.6 });
  for (const offset of [-150, 150]) {
    const door = new Mesh(new BoxGeometry(8, 50, 42), doorMaterial);
    door.position.set(map.floor.x + offset, 26, trainY);
    door.name = "platform-train-door";
    door.userData = { kind: "platformTrainDoor" };
    group.add(door);
  }

  const objects: { name: string; position: { x: number; y: number } }[] = [
    { name: "coal pile", position: map.objects.coalPile },
    { name: "boiler", position: map.objects.boiler },
    { name: "wrench", position: map.objects.wrench },
    { name: "breach", position: map.objects.breach },
    { name: "departure lever", position: map.objects.departureLever },
    ...map.objects.boards.map((position, index) => ({ name: `board ${index + 1}`, position })),
  ];
  for (const object of objects) group.add(platformObject(object.name, object.position.x, object.position.y));

  return group;
}

function buildPlayerGroup(player: RenderPlayer, seat: number, labelFactory: LabelFactory): Group {
  const group = new Group();
  group.name = `player-${player.id}`;
  group.userData = { kind: "player", playerId: player.id, name: player.name };

  const color = new Color(PLAYER_COLORS[seat % PLAYER_COLORS.length] ?? PLAYER_COLORS[0]);
  const body = new Mesh(
    new CylinderGeometry(PLAYER_RADIUS, PLAYER_RADIUS, PLAYER_HEIGHT, 20),
    new MeshStandardMaterial({ color, roughness: 0.6 }),
  );
  body.position.y = PLAYER_HEIGHT / 2;
  body.userData = { kind: "playerBody", playerId: player.id, seat, baseY: body.position.y };
  group.add(body);

  const label = labelFactory(player.name);
  label.position.y = 62;
  group.add(label);

  group.position.set(player.position.x, 0, player.position.y);
  group.userData.motion = { lastX: player.position.x, lastZ: player.position.y, speed: 0, phase: 0, seconds: 0 };
  return group;
}

function disposeObject(object: Object3D): void {
  object.traverse((child) => {
    if (child instanceof Mesh) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) material.dispose();
    }
  });
}

export function buildPlatformScene(
  players: readonly RenderPlayer[] = [],
  options: PlatformSceneOptions = {},
): PlatformScene {
  const map = options.map ?? createPlatformMap();
  const labelFactory = options.labelFactory ?? createNameLabel;

  const scene = new Scene();
  scene.background = new Color("#101018");

  const camera = new PerspectiveCamera(45, 16 / 9, 1, 6000);
  fitCameraToPlatform(camera, map, 16 / 9);
  scene.add(camera);

  scene.add(new AmbientLight(0xffffff, 1.2));
  const sun = new DirectionalLight(0xffffff, 2.2);
  sun.position.set(-200, 900, 420);
  scene.add(sun);

  const mapGroup = buildMapGroup(map);
  scene.add(mapGroup);

  const playersGroup = new Group();
  playersGroup.name = "players";
  scene.add(playersGroup);

  const drawnPlayers = new Map<string, Drawn<Group>>();

  // Called once per animation frame while the crew waits: figures are kept and moved, and one is
  // only rebuilt when its seat or name changes (see `reconcile` in trainScene.ts).
  const updatePlayers = (next: readonly RenderPlayer[]): void => {
    reconcile(
      playersGroup,
      drawnPlayers,
      next.map((player, seat) => ({
        id: player.id,
        key: [seat, player.name].join("|"),
        build: () => buildPlayerGroup(player, seat, labelFactory),
        place: (group: Group) => {
          group.position.set(player.position.x, 0, player.position.y);
        },
      })),
      disposeObject,
    );
  };

  /** Walk bob and idle breathing for the waiting crew; the platform figures have no limbs (#294). */
  const updateMotion = (dt: number): void => {
    for (const group of playersGroup.children) {
      const motion = group.userData.motion as
        | { lastX: number; lastZ: number; speed: number; phase: number; seconds: number }
        | undefined;
      if (!motion) continue;
      const measured = speedBetween(
        { x: motion.lastX, y: motion.lastZ },
        { x: group.position.x, y: group.position.z },
        dt,
      );
      motion.speed = smoothSpeed(motion.speed, measured, dt);
      motion.lastX = group.position.x;
      motion.lastZ = group.position.z;
      motion.phase = advanceWalk(motion.phase, motion.speed, dt);
      if (Number.isFinite(dt) && dt > 0) motion.seconds += dt;

      const pose = crewPose({
        speed: motion.speed,
        phase: motion.phase,
        seconds: motion.seconds,
        carrying: false,
        interacting: false,
      });
      const body = group.children.find((child) => child.userData.kind === "playerBody");
      if (body) {
        const base = typeof body.userData.baseY === "number" ? body.userData.baseY : PLAYER_HEIGHT / 2;
        body.position.y = base + pose.bob;
        body.rotation.z = pose.legSwing * 0.12;
      }
    }
  };

  updatePlayers(players);

  return {
    scene,
    camera,
    playersGroup,
    mapGroup,
    map,
    updatePlayers,
    updateMotion,
    dispose: () => {
      drawnPlayers.clear();
      disposeObject(scene);
    },
  };
}
