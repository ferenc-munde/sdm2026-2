// Builds the Three.js scene for the train cutaway and the players.
//
// The renderer is a pure function of the state it is given: `buildTrainScene`
// creates the scene, and `updatePlayers` replaces the player figures when new
// state arrives. It never changes the game state itself.
//
// The train is drawn as simple boxes seen from above at an angle, which gives
// the cutaway look without any art assets (PLAN.md section 1).

import {
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  Sprite,
  SpriteMaterial,
  type Object3D,
} from "three";
import type { RenderPlayer } from "./renderPlayer.ts";
import { WALL_HEIGHT, createTrainMap, type TrainMap } from "./trainMap.ts";

/** One distinct colour per seat, in the order the players joined. */
export const PLAYER_COLORS = ["#e5484d", "#3e63dd", "#30a46c", "#f5d90a"] as const;

/** Player figure radius, in world units. Matches PLAYER_RADIUS in the shared contract once #5 lands. */
export const PLAYER_RADIUS = 12;
/** Player figure height, in world units. */
export const PLAYER_HEIGHT = 34;

const FLOOR_THICKNESS = 8;
const DOOR_THICKNESS = 2;
const LABEL_HEIGHT = 62;

const FLOOR_COLOR = "#2a2a33";
const WALL_COLOR = "#71717f";
const DOOR_COLOR = "#c9a227";

/** A sprite-like label above a player's head. Injected in tests so no canvas is needed. */
export type LabelFactory = (name: string) => Object3D;

export interface TrainSceneOptions {
  /** The layout to draw. Defaults to the deterministic three-car train. */
  map?: TrainMap;
  /** Builds the name label above a player. Defaults to a canvas sprite. */
  labelFactory?: LabelFactory;
}

export interface TrainScene {
  scene: Scene;
  camera: PerspectiveCamera;
  /** Holds one group per player; replaced by `updatePlayers`. */
  playersGroup: Group;
  /** Holds the floor, the walls and the doors. */
  mapGroup: Group;
  map: TrainMap;
  updatePlayers(players: readonly RenderPlayer[]): void;
  dispose(): void;
}

/** The x coordinate halfway along the train. */
export function mapCentreX(map: TrainMap): number {
  if (map.cars.length === 0) return 0;
  const first = map.cars[0];
  const last = map.cars[map.cars.length - 1];
  if (!first || !last) return 0;
  return (first.x + last.x) / 2;
}

/** How far down the camera looks: 55 degrees below the horizon. */
const CAMERA_ELEVATION_DEGREES = 55;
/** Free space kept around the train so the outer walls are not at the screen edge. */
const CAMERA_MARGIN = 120;

/**
 * Places the camera above the train at an angle and far enough away that the
 * whole train fits the viewport. Call it again on resize with the new aspect.
 */
export function fitCameraToMap(camera: PerspectiveCamera, map: TrainMap, aspect: number): void {
  const centreX = mapCentreX(map);
  const halfLength = map.cars.reduce((widest, car) => Math.max(widest, Math.abs(car.x - centreX) + car.width / 2), 0);
  const depth = map.cars.reduce((deepest, car) => Math.max(deepest, car.depth), 0);

  const widthToFit = halfLength * 2 + CAMERA_MARGIN;
  const depthToFit = depth + CAMERA_MARGIN;
  const halfFov = (camera.fov * Math.PI) / 180 / 2;
  const distanceForWidth = widthToFit / (2 * Math.tan(halfFov) * Math.max(aspect, 0.1));
  const distanceForDepth = depthToFit / (2 * Math.tan(halfFov));
  const distance = Math.max(distanceForWidth, distanceForDepth);
  const elevation = (CAMERA_ELEVATION_DEGREES * Math.PI) / 180;

  camera.aspect = aspect;
  camera.position.set(centreX, distance * Math.sin(elevation), distance * Math.cos(elevation));
  camera.lookAt(centreX, 0, 0);
  camera.updateProjectionMatrix();
}

/** Creates the camera already fitted to the default 16:9 viewport. */
function createCamera(map: TrainMap): PerspectiveCamera {
  const camera = new PerspectiveCamera(45, 16 / 9, 1, 6000);
  fitCameraToMap(camera, map, 16 / 9);
  return camera;
}

function buildMapGroup(map: TrainMap): Group {
  const group = new Group();
  group.name = "train";

  const floorMaterial = new MeshStandardMaterial({ color: new Color(FLOOR_COLOR), roughness: 0.95 });
  const wallMaterial = new MeshStandardMaterial({ color: new Color(WALL_COLOR), roughness: 0.8 });
  const doorMaterial = new MeshStandardMaterial({ color: new Color(DOOR_COLOR), roughness: 0.6 });

  for (const car of map.cars) {
    const mesh = new Mesh(new BoxGeometry(car.width, FLOOR_THICKNESS, car.depth), floorMaterial);
    mesh.position.set(car.x, -FLOOR_THICKNESS / 2, car.z);
    mesh.name = `car-${car.index}`;
    mesh.userData = { kind: "car", index: car.index };
    group.add(mesh);
  }

  for (const wall of map.walls) {
    const mesh = new Mesh(new BoxGeometry(wall.width, WALL_HEIGHT, wall.depth), wallMaterial);
    mesh.position.set(wall.x, WALL_HEIGHT / 2, wall.z);
    mesh.name = "wall";
    mesh.userData = { kind: "wall" };
    group.add(mesh);
  }

  for (const door of map.doors) {
    const mesh = new Mesh(new BoxGeometry(door.width, DOOR_THICKNESS, door.depth), doorMaterial);
    mesh.position.set(door.x, DOOR_THICKNESS / 2, door.z);
    mesh.name = `door-${door.fromCar}-${door.toCar}`;
    mesh.userData = { kind: "door", fromCar: door.fromCar, toCar: door.toCar };
    group.add(mesh);
  }

  return group;
}

/** Draws a name above a player's head. Browser only; tests inject their own factory. */
export function createNameLabel(name: string): Object3D {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 80;

  const context = canvas.getContext("2d");
  if (context) {
    context.font = "bold 42px system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineWidth = 6;
    context.strokeStyle = "rgba(0, 0, 0, 0.75)";
    context.strokeText(name, canvas.width / 2, canvas.height / 2);
    context.fillStyle = "#ffffff";
    context.fillText(name, canvas.width / 2, canvas.height / 2);
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const sprite = new Sprite(
    new SpriteMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  sprite.scale.set(96, 24, 1);
  sprite.name = `label-${name}`;
  sprite.userData = { kind: "label", name };
  return sprite;
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
  body.name = `body-${player.id}`;
  body.userData = { kind: "playerBody", playerId: player.id, seat };
  group.add(body);

  const label = labelFactory(player.name);
  label.position.y = LABEL_HEIGHT;
  group.add(label);

  // Floor position (x, y) becomes scene position (x, 0, z).
  group.position.set(player.position.x, 0, player.position.y);
  return group;
}

function disposeObject(object: Object3D): void {
  object.traverse((child) => {
    if (child instanceof Mesh) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) material.dispose();
    } else if (child instanceof Sprite) {
      const material = child.material;
      material.map?.dispose();
      material.dispose();
    }
  });
}

/**
 * Creates the scene, camera, lights and train for `players`.
 * Call `updatePlayers` whenever a new game state arrives.
 */
export function buildTrainScene(
  players: readonly RenderPlayer[] = [],
  options: TrainSceneOptions = {},
): TrainScene {
  const map = options.map ?? createTrainMap();
  const labelFactory = options.labelFactory ?? createNameLabel;

  const scene = new Scene();
  scene.background = new Color("#101018");

  const camera = createCamera(map);
  scene.add(camera);

  const ambient = new AmbientLight(0xffffff, 1.2);
  scene.add(ambient);

  const sun = new DirectionalLight(0xffffff, 2.2);
  sun.position.set(mapCentreX(map) - 300, 900, 420);
  scene.add(sun);

  const mapGroup = buildMapGroup(map);
  scene.add(mapGroup);

  const playersGroup = new Group();
  playersGroup.name = "players";
  scene.add(playersGroup);

  const updatePlayers = (next: readonly RenderPlayer[]): void => {
    for (const child of [...playersGroup.children]) {
      playersGroup.remove(child);
      disposeObject(child);
    }
    next.forEach((player, seat) => {
      playersGroup.add(buildPlayerGroup(player, seat, labelFactory));
    });
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
      disposeObject(scene);
    },
  };
}
