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
  HemisphereLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  type Object3D,
} from "three";
import { createPlatformMap, type PlatformMap } from "../shared/map/platform.ts";
import { buildCrewFigure } from "./crewModel.ts";
import { buildBreachModel, buildStationModel } from "./propModels.ts";
import { PALETTE, mat } from "./style.ts";
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

  const add = (mesh: Mesh, offsetY: number): Mesh => {
    mesh.position.y = offsetY;
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };

  // The practice objects reuse the train's own station models (visual pass), so players learn
  // exactly what they'll see on board.
  switch (name) {
    case "coal pile":
      group.add(buildStationModel("coalDispenser"));
      break;
    case "boiler":
      group.add(buildStationModel("engine"));
      break;
    case "wrench":
      group.add(buildStationModel("wrenchRack"));
      break;
    case "breach":
      group.add(buildBreachModel());
      break;
    case "departure lever": {
      group.add(buildStationModel("steeringConsole"));
      add(new Mesh(new BoxGeometry(34, 2, 34), mat("#f5d90a", { emissive: "#f5d90a", emissiveIntensity: 0.25 })), 1);
      break;
    }
    default: {
      // A wooden how-to-play notice board on two posts, against the train.
      for (const z of [-26, 26]) add(new Mesh(new BoxGeometry(5, 56, 5), mat(PALETTE.woodDark)), 28).position.z = z;
      const board = new Mesh(new BoxGeometry(5, 34, 60), mat(PALETTE.wood));
      board.position.y = 40;
      group.add(board);
      const sheet = new Mesh(new BoxGeometry(5.6, 26, 50), mat("#efe6cf"));
      sheet.position.y = 40;
      group.add(sheet);
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
    mat("#8a8378", { roughness: 0.95 }),
  );
  floor.position.set(map.floor.x, -FLOOR_THICKNESS / 2, map.floor.y);
  // Yellow safety line along the platform edge, and grass beyond it.
  const line = new Mesh(new BoxGeometry(map.floor.width, 0.6, 6), mat("#e8c33a"));
  line.position.set(map.floor.x, 0.3, map.floor.y + map.floor.depth / 2 - 14);
  group.add(line);
  const grass = new Mesh(new BoxGeometry(map.floor.width * 4, 4, map.floor.depth * 6), mat(PALETTE.grass, { roughness: 1 }));
  grass.position.set(map.floor.x, -FLOOR_THICKNESS - 6, map.floor.y);
  group.add(grass);
  floor.name = "platform-floor";
  floor.userData = { kind: "platformFloor" };
  group.add(floor);

  const wallMaterial = mat("#6e665b", { roughness: 0.9 });
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
    mat(PALETTE.paint, { roughness: 0.55 }),
  );
  body.position.set(map.floor.x, 30, trainY);
  // Brass trim, a roof and a row of lit windows, so the waiting train is our train.
  for (const [w, h, d, y, colour] of [[map.floor.width + 4, 3, 42, 4, PALETTE.brass], [map.floor.width + 8, 8, 52, 64, PALETTE.paintDark]] as const) {
    const strip = new Mesh(new BoxGeometry(w, h, d), mat(colour));
    strip.position.set(map.floor.x, y, trainY);
    group.add(strip);
  }
  for (let x = map.floor.x - map.floor.width / 2 + 60; x < map.floor.x + map.floor.width / 2 - 40; x += 90) {
    const pane = new Mesh(new BoxGeometry(46, 20, 1), mat(PALETTE.lamp, { emissive: PALETTE.lamp, emissiveIntensity: 0.5 }));
    pane.position.set(x, 40, trainY + 20.6);
    group.add(pane);
  }
  body.name = "platform-train";
  body.userData = { kind: "platformTrain" };
  group.add(body);

  const doorMaterial = mat(PALETTE.iron, { metalness: 0.3, roughness: 0.6 });
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
  // The same crew member as on the train (visual pass, #262), so the lobby and the run match.
  const { figure, body } = buildCrewFigure(color);
  figure.scale.setScalar(1.35);
  body.userData = { kind: "playerBody", playerId: player.id, seat };
  group.add(figure);

  const label = labelFactory(player.name);
  label.position.y = 70;
  group.add(label);

  group.position.set(player.position.x, 0, player.position.y);
  const facing = player.facing;
  group.rotation.y = facing && (facing.dx !== 0 || facing.dy !== 0) ? -Math.atan2(facing.dy, facing.dx) : 0;
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
  scene.background = new Color(PALETTE.sky);

  const camera = new PerspectiveCamera(45, 16 / 9, 1, 6000);
  fitCameraToPlatform(camera, map, 16 / 9);
  scene.add(camera);

  // The same evening light as on the train.
  scene.add(new AmbientLight(0xffffff, 0.35));
  scene.add(new HemisphereLight("#9fb6e0", "#4a3a26", 1.1));
  const sun = new DirectionalLight("#ffe2b8", 2.6);
  sun.position.set(-300, 900, 500);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -600, right: 600, top: 400, bottom: -400, near: 100, far: 2200 });
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

  updatePlayers(players);

  return {
    scene,
    camera,
    playersGroup,
    mapGroup,
    map,
    updatePlayers,
    dispose: () => {
      drawnPlayers.clear();
      disposeObject(scene);
    },
  };
}
