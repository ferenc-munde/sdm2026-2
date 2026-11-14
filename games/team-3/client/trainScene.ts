// Builds the Three.js scene for the train, the players and everything in the
// game state: stations, items, hazards and repair progress (#19).
//
// The renderer is a pure function of the state it is given: `buildTrainScene`
// creates the static map, and `updateState` makes the dynamic parts match new
// state, reusing the objects that did not change. It never changes the game state itself.

import {
  AmbientLight,
  BoxGeometry,
  CapsuleGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  type Object3D,
} from "three";
import { createTrainMap, type TrainMap } from "../shared/map/map.ts";
import type { Hazard, Item, ItemKind, StationKind } from "../shared/types.ts";
import type { ActionHighlight } from "./actionHighlight.ts";
import {
  advanceWalk,
  crewPose,
  smoothSpeed,
  speedBetween,
  wheelAngle,
  type CrewPose,
} from "./crewPose.ts";
import { createHighlightRing } from "./highlightRing.ts";
import type { RenderPlayer } from "./renderPlayer.ts";
import { applyCrewPose, buildCrewFigure, HOLD_POINT } from "./crewModel.ts";

/** The crew are drawn a little larger than their collision circle so they read from the camera. */
const CREW_SCALE = 1.35;
import { buildBreachModel, buildFlame, buildItemModel, buildStationModel, FLAME_SCALE } from "./propModels.ts";
import { PALETTE, mat, ownMat } from "./style.ts";
import { buildTrainBody, END_WALL_HEIGHT, FAR_WALL_HEIGHT, LOCOMOTIVE_LENGTH, NEAR_WALL_HEIGHT } from "./trainModel.ts";

/** One distinct colour per seat, in the order the players joined. */
export const PLAYER_COLORS = ["#e5484d", "#3e63dd", "#30a46c", "#f5d90a"] as const;

/** Player figure radius, in world units. Matches PLAYER_RADIUS in the shared contract. */
export const PLAYER_RADIUS = 12;
/** Player figure height, in world units. */
export const PLAYER_HEIGHT = 34;

/** Only the fields the renderer reads, so tests can pass small objects. */
export type RenderItem = Pick<Item, "id" | "kind" | "position" | "heldBy">;
export type RenderHazard = Pick<Hazard, "id" | "kind" | "position" | "progress">;

/** The dynamic part of the state the scene draws. */
export interface RenderWorld {
  players?: readonly RenderPlayer[];
  items?: readonly RenderItem[];
  hazards?: readonly RenderHazard[];
}

const FLOOR_THICKNESS = 8;
const WALL_HEIGHT = 30;
const DOOR_THICKNESS = 2;
const LABEL_HEIGHT = 70;
const HAZARD_BAR_HEIGHT = 46;
const HAZARD_BAR_WIDTH = 44;

const FLOOR_COLOR = "#2a2a33";
const WALL_COLOR = "#71717f";
const DOOR_COLOR = "#c9a227";

const STATION_COLORS: Record<StationKind, string> = {
  engine: "#b3541e",
  coalDispenser: "#5c5c66",
  wrenchRack: "#9aa0a6",
  extinguisherRack: "#c0392b",
  steeringConsole: "#3e63dd",
};

const ITEM_COLORS: Record<ItemKind, string> = {
  coal: "#26262c",
  wrench: "#9aa0a6",
  extinguisher: "#c0392b",
};

const HAZARD_COLORS = { breach: "#3e63dd", fire: "#f76b15", course: "#e5484d" } as const;

/** A sprite-like label above a player's head. Injected in tests so no canvas is needed. */
export type LabelFactory = (name: string) => Object3D;

export interface TrainSceneOptions {
  /** The layout to draw. Defaults to the shared train map. */
  map?: TrainMap;
  /** Builds the name label above a player. Defaults to a canvas sprite. */
  labelFactory?: LabelFactory;
}

export interface TrainScene {
  scene: Scene;
  camera: PerspectiveCamera;
  /** One group per player, in seat order; `updateState` keeps and moves them, and rebuilds one only when it changes. */
  playersGroup: Group;
  /** One group per item on the floor; held items live in their player group. */
  itemsGroup: Group;
  /** One group per hazard, with its repair bar. */
  hazardsGroup: Group;
  /** The floor, walls, doors and stations. */
  mapGroup: Group;
  /**
   * The train and everything on it (map, items, hazards, players) without the
   * camera and lights. Tilt this for the course-hazard hull roll (#219).
   */
  hullGroup: Group;
  map: TrainMap;
  updateState(world: RenderWorld): void;
  /** Animates fire flicker and breach steam; call every frame with the elapsed seconds. */
  updateEffects(seconds: number): void;
  /**
   * Walk/idle/carry poses for the crew and the wheel roll (#294). `interactingPlayerId` is the
   * local player while the interact key is held; other players' input is not synced.
   */
  updateMotion(dt: number, speedFactor: number, interactingPlayerId?: string): void;
  /** Rings the object the local player's action key would use (#295); null hides the ring. */
  updateHighlight(highlight: ActionHighlight | null, seconds: number): void;
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
const CAMERA_ELEVATION_DEGREES = 48;
/** Free space kept around the train so the outer walls are not at the screen edge. */
const CAMERA_MARGIN = 90;

/**
 * Places the camera above the train at an angle and far enough away that the
 * whole train fits the viewport. Call it again on resize with the new aspect.
 */
export function fitCameraToMap(camera: PerspectiveCamera, map: TrainMap, aspect: number): void {
  // Frame the cars plus the locomotive in front of the first one (visual pass).
  // The cowcatcher and smokebox reach ~50 units past the locomotive's length.
  const centreX = mapCentreX(map) - (LOCOMOTIVE_LENGTH + 50) / 2;
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

function createCamera(map: TrainMap): PerspectiveCamera {
  const camera = new PerspectiveCamera(35, 16 / 9, 1, 8000);
  fitCameraToMap(camera, map, 16 / 9);
  return camera;
}

function buildStation(kind: StationKind, position: { x: number; y: number }): Group {
  const group = new Group();
  group.name = `station-${kind}`;
  group.userData = { kind: "station", stationKind: kind };
  group.position.set(position.x, 0, position.y);

  // A low base in the station's colour keeps stations easy to tell apart; the model on it shows
  // what the station is (visual pass).
  const base = new Mesh(new BoxGeometry(46, 2, 46), mat(STATION_COLORS[kind], { roughness: 0.7 }));
  base.position.y = 1;
  base.receiveShadow = true;
  base.userData = { kind: "stationPad", stationKind: kind };
  group.add(base);
  group.add(buildStationModel(kind));

  return group;
}

function buildMapGroup(map: TrainMap): Group {
  const group = new Group();
  group.name = "train";

  const floorMaterial = mat(PALETTE.wood, { roughness: 0.9 });
  const wallMaterial = mat(PALETTE.paint, { roughness: 0.55 });
  const capMaterial = mat(PALETTE.brass, { metalness: 0.5, roughness: 0.4 });
  const doorMaterial = mat(PALETTE.ironLight, { metalness: 0.4, roughness: 0.5 });

  for (const car of map.cars) {
    const mesh = new Mesh(new BoxGeometry(car.width, FLOOR_THICKNESS, car.depth), floorMaterial);
    mesh.position.set(car.x, -FLOOR_THICKNESS / 2, car.y);
    mesh.receiveShadow = true;
    mesh.name = `car-${car.index}`;
    mesh.userData = { kind: "car", index: car.index };
    group.add(mesh);

  }

  // Cut-away carriage walls: the far side is a full wall, the near side stays low so the camera
  // sees in, and the ends sit in between. Same positions as the rules' collision walls.
  const trackCentre = map.cars.reduce((sum, car) => sum + car.y, 0) / Math.max(1, map.cars.length);
  for (const wall of map.walls) {
    const alongTrain = wall.width > wall.depth;
    const height = !alongTrain ? END_WALL_HEIGHT : wall.y < trackCentre ? FAR_WALL_HEIGHT : NEAR_WALL_HEIGHT;
    const mesh = new Mesh(new BoxGeometry(wall.width, height, wall.depth), wallMaterial);
    mesh.position.set(wall.x, height / 2, wall.y);
    mesh.name = "wall";
    mesh.userData = { kind: "wall" };
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    const cap = new Mesh(new BoxGeometry(wall.width + 2, 2.5, wall.depth + 2), capMaterial);
    cap.position.set(wall.x, height + 1.25, wall.y);
    cap.userData = { kind: "trainDetail" };
    group.add(cap);
  }

  for (const door of map.doors) {
    const mesh = new Mesh(new BoxGeometry(door.width, DOOR_THICKNESS, door.depth), doorMaterial);
    mesh.position.set(door.x, DOOR_THICKNESS / 2, door.y);
    mesh.receiveShadow = true;
    mesh.name = `door-${door.fromCar}-${door.toCar}`;
    mesh.userData = { kind: "door", fromCar: door.fromCar, toCar: door.toCar };
    group.add(mesh);
  }

  for (const station of map.stations) {
    group.add(buildStation(station.kind, station.position));
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
  const sprite = new Sprite(new SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(96, 24, 1);
  sprite.name = `label-${name}`;
  sprite.userData = { kind: "label", name };
  return sprite;
}

function buildItemMesh(item: RenderItem, scale = 1): Mesh {
  const mesh = buildItemModel(item.kind, scale);
  mesh.name = `item-${item.id}`;
  mesh.userData = { kind: "item", itemId: item.id, itemKind: item.kind };
  return mesh;
}

function buildPlayerGroup(
  player: RenderPlayer,
  seat: number,
  labelFactory: LabelFactory,
  heldItems: readonly RenderItem[],
): Group {
  const group = new Group();
  group.name = `player-${player.id}`;
  group.userData = { kind: "player", playerId: player.id, name: player.name };

  // A crew member (visual pass, #262): an engineer with cap and jacket in the player's colour,
  // animated by `updateEffects` (walk, idle, carry).
  const color = new Color(PLAYER_COLORS[seat % PLAYER_COLORS.length] ?? PLAYER_COLORS[0]);
  const { figure, body } = buildCrewFigure(color);
  figure.scale.setScalar(CREW_SCALE);
  body.name = `body-${player.id}`;
  body.userData = { kind: "playerBody", playerId: player.id, seat };
  group.add(figure);

  const label = labelFactory(player.name);
  label.position.y = LABEL_HEIGHT;
  group.add(label);

  // A held item is drawn next to its player, not on the floor.
  const held = heldItems.find((item) => item.heldBy === player.id);
  if (held) {
    const mesh = buildItemMesh(held, 0.7);
    mesh.name = `held-${held.id}`;
    mesh.position.set(HOLD_POINT.x * CREW_SCALE, HOLD_POINT.y * CREW_SCALE, HOLD_POINT.z);
    mesh.userData = { ...mesh.userData, kind: "heldItem", heldBy: player.id, baseY: mesh.position.y };
    group.add(mesh);
  }

  placePlayer(group, player);
  // Walk-cycle state (#294), kept on the group so a rebuilt figure starts fresh.
  group.userData.motion = { lastX: player.position.x, lastZ: player.position.y, speed: 0, phase: 0, seconds: 0 };
  return group;
}

interface MotionState {
  lastX: number;
  lastZ: number;
  speed: number;
  phase: number;
  seconds: number;
}

/** Applies a #294 pose to one crew figure, and bobs the item it holds with it. */
function poseFigure(group: Object3D, pose: CrewPose): void {
  const figure = group.getObjectByName("crew");
  if (figure) applyCrewPose(figure, { ...pose, bob: pose.bob / CREW_SCALE });
  for (const child of group.children) {
    if (child.userData.kind === "heldItem" && typeof child.userData.baseY === "number") {
      child.position.y = child.userData.baseY + pose.bob;
    }
  }
}

/** Moves a player figure to its position and turns it to face its walking direction. */
function placePlayer(group: Object3D, player: RenderPlayer): void {
  group.position.set(player.position.x, 0, player.position.y);
  // Local +x points along `facing`; a player with no direction faces +x, as a newly built one does.
  const facing = player.facing;
  group.rotation.y = facing && (facing.dx !== 0 || facing.dy !== 0) ? -Math.atan2(facing.dy, facing.dx) : 0;
}

function buildHazardGroup(hazard: RenderHazard): Group {
  const group = new Group();
  group.name = `hazard-${hazard.id}`;
  group.userData = { kind: "hazard", hazardId: hazard.id, hazardKind: hazard.kind };

  const color = new Color(HAZARD_COLORS[hazard.kind]);
  const material = new MeshStandardMaterial({ color, roughness: 0.5, emissive: color, emissiveIntensity: 0.35 });

  if (hazard.kind === "fire") {
    const flame = buildFlame();
    flame.position.y = 31; // the scaled flame's base (the ember bed) sits on the floor
    flame.name = "fire";
    flame.userData = { kind: "hazardShape", hazardKind: hazard.kind };
    group.add(flame);
  } else if (hazard.kind === "breach") {
    const mark = buildBreachModel();
    mark.name = "breach";
    mark.userData = { kind: "hazardShape", hazardKind: hazard.kind };
    group.add(mark);
  } else {
    const mark = new Mesh(new CylinderGeometry(18, 18, 4, 20), material);
    mark.position.y = 4;
    mark.name = "course";
    mark.userData = { kind: "hazardShape", hazardKind: hazard.kind };
    group.add(mark);
  }

  // Steam puffs on a breach (#217), animated by `updateEffects`.
  if (hazard.kind === "breach") {
    for (let index = 0; index < 4; index += 1) {
      const puff = new Mesh(
        new SphereGeometry(5, 8, 6),
        new MeshStandardMaterial({ color: 0xd7e2f0, transparent: true, opacity: 0.5, depthWrite: false }),
      );
      puff.name = "steam";
      puff.position.y = 4;
      puff.userData = { kind: "steam", phase: index / 4 };
      group.add(puff);
    }
  }

  // Repair progress (#19): a bar above the hazard that follows `hazard.progress`.
  const bar = new Group();
  bar.name = "progress";
  bar.position.y = HAZARD_BAR_HEIGHT;
  bar.userData = { kind: "progressBar", hazardId: hazard.id, progress: 0 };

  const back = new Mesh(
    new BoxGeometry(HAZARD_BAR_WIDTH, 5, 3),
    new MeshStandardMaterial({ color: 0x101018, roughness: 1 }),
  );
  back.name = "progressBack";
  bar.add(back);

  const fill = new Mesh(
    new BoxGeometry(HAZARD_BAR_WIDTH, 5, 3.2),
    new MeshStandardMaterial({ color: 0x30a46c, roughness: 0.6 }),
  );
  fill.name = "progressFill";
  fill.userData = { kind: "progressFill", hazardId: hazard.id, progress: 0 };
  bar.add(fill);

  group.add(bar);
  placeHazard(group, hazard);
  return group;
}

/** Moves a hazard to its position and sets its repair bar to `hazard.progress`. */
function placeHazard(group: Object3D, hazard: RenderHazard): void {
  group.position.set(hazard.position.x, 0, hazard.position.y);
  const progress = Math.min(1, Math.max(0, hazard.progress));
  const bar = group.children.find((child) => child.name === "progress");
  const fill = bar?.children.find((child) => child.name === "progressFill");
  if (!bar || !fill) return;
  bar.userData.progress = progress;
  fill.userData.progress = progress;
  fill.scale.x = progress;
  fill.position.x = -(HAZARD_BAR_WIDTH / 2) * (1 - progress);
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

/** An object in the scene and what it was built from; `key` changes when it has to be rebuilt. */
export interface Drawn<T extends Object3D> {
  object: T;
  key: string;
}

/** One entry of the state to draw: how to build its object and how to move it into place. */
export interface DrawEntry<T extends Object3D> {
  id: string;
  /** Everything that needs a rebuild when it changes (name, kind, seat, held item). */
  key: string;
  build(): T;
  /** Applies what changes every tick (position, facing, progress) to an existing object. */
  place(object: T): void;
}

/**
 * Makes `parent` show exactly `entries`, in that order, reusing the objects already there. An object
 * is only built when it is new or its `key` changed, and only disposed when it is gone, so a state
 * that arrives every frame moves meshes instead of rebuilding geometries, materials and label
 * textures 60 times a second.
 */
export function reconcile<T extends Object3D>(
  parent: Group,
  drawn: Map<string, Drawn<T>>,
  entries: readonly DrawEntry<T>[],
  dispose: (object: Object3D) => void,
): void {
  const wanted = new Set<string>();
  const ordered: T[] = [];
  for (const entry of entries) {
    wanted.add(entry.id);
    let current = drawn.get(entry.id);
    if (!current || current.key !== entry.key) {
      if (current) {
        parent.remove(current.object);
        dispose(current.object);
      }
      current = { object: entry.build(), key: entry.key };
      drawn.set(entry.id, current);
    }
    entry.place(current.object);
    ordered.push(current.object);
  }
  for (const [id, current] of drawn) {
    if (wanted.has(id)) continue;
    parent.remove(current.object);
    dispose(current.object);
    drawn.delete(id);
  }
  // Children stay in state order (seat order for players); only touched when it differs.
  const inOrder =
    parent.children.length === ordered.length && ordered.every((object, index) => parent.children[index] === object);
  if (!inOrder) {
    parent.remove(...parent.children);
    if (ordered.length > 0) parent.add(...ordered);
  }
}

/**
 * Creates the scene, camera, lights and static map. Call `updateState` whenever
 * a new game state arrives.
 */
export function buildTrainScene(
  world: RenderWorld = {},
  options: TrainSceneOptions = {},
): TrainScene {
  const map = options.map ?? createTrainMap();
  const labelFactory = options.labelFactory ?? createNameLabel;

  const scene = new Scene();
  scene.background = new Color(PALETTE.sky);
  scene.fog = new Fog(PALETTE.fog, 2200, 5200);

  const camera = createCamera(map);
  scene.add(camera);

  // Evening light: a cool sky above, warm bounce from the ground, and a low warm sun that casts
  // shadows so the crew, props and walls sit on the floor instead of floating.
  scene.add(new AmbientLight(0xffffff, 0.35));
  scene.add(new HemisphereLight("#9fb6e0", "#4a3a26", 1.1));
  const sun = new DirectionalLight("#ffe2b8", 2.6);
  sun.position.set(mapCentreX(map) - 500, 900, 600);
  sun.target.position.set(mapCentreX(map) - (LOCOMOTIVE_LENGTH + 50) / 2, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -950, right: 950, top: 500, bottom: -500, near: 100, far: 2400 });
  sun.shadow.bias = -0.0008;
  scene.add(sun, sun.target);

  // One group for the hull and everything standing on it, so the course-hazard
  // feedback can roll the train without moving the camera (#219).
  const hullGroup = new Group();
  hullGroup.name = "hull";
  scene.add(hullGroup);

  const mapGroup = buildMapGroup(map);
  hullGroup.add(mapGroup);
  const body = buildTrainBody(map);
  hullGroup.add(body.group);

  // Chimney smoke: a few puffs that rise, grow and fade, faster when the train goes faster.
  const smoke: Mesh[] = [];
  for (let index = 0; index < 6; index += 1) {
    const puff = new Mesh(new SphereGeometry(9, 8, 6), ownMat(PALETTE.steam, { opacity: 0.5 }));
    puff.userData = { phase: index / 6 };
    smoke.push(puff);
    hullGroup.add(puff);
  }
  let speedFactor = 0;
  let lastSeconds: number | null = null;

  const itemsGroup = new Group();
  itemsGroup.name = "items";
  hullGroup.add(itemsGroup);

  const hazardsGroup = new Group();
  hazardsGroup.name = "hazards";
  hullGroup.add(hazardsGroup);

  const playersGroup = new Group();
  playersGroup.name = "players";
  hullGroup.add(playersGroup);

  // On the floor under the action target (#295), outside the hull group so the course roll does
  // not tilt it.
  const actionRing = createHighlightRing();
  scene.add(actionRing.group);

  const drawnPlayers = new Map<string, Drawn<Group>>();
  const drawnItems = new Map<string, Drawn<Mesh>>();
  const drawnHazards = new Map<string, Drawn<Group>>();

  // Called with every state, in practice once per animation frame: objects are kept and moved, and
  // only rebuilt when something that shapes them changes (see `reconcile`).
  const updateState = (next: RenderWorld): void => {
    const players = next.players ?? [];
    const items = next.items ?? [];
    const hazards = next.hazards ?? [];

    reconcile(
      playersGroup,
      drawnPlayers,
      players.map((player, seat) => {
        const held = items.find((item) => item.heldBy === player.id);
        return {
          id: player.id,
          key: [seat, player.name, held ? held.id : "", held ? held.kind : ""].join("|"),
          build: () => buildPlayerGroup(player, seat, labelFactory, items),
          place: (group: Group) => placePlayer(group, player),
        };
      }),
      disposeObject,
    );

    reconcile(
      itemsGroup,
      drawnItems,
      items
        .filter((item) => item.heldBy === null)
        .map((item) => ({
          id: item.id,
          key: item.kind,
          build: () => buildItemMesh(item),
          place: (mesh: Mesh) => {
            mesh.position.set(item.position.x, 10, item.position.y);
          },
        })),
      disposeObject,
    );

    reconcile(
      hazardsGroup,
      drawnHazards,
      hazards.map((hazard) => ({
        id: hazard.id,
        key: hazard.kind,
        build: () => buildHazardGroup(hazard),
        place: (group: Group) => placeHazard(group, hazard),
      })),
      disposeObject,
    );
  };

  /** Fire flicker and rising breach steam; pure presentation, driven by the frame clock. */
  const updateEffects = (seconds: number): void => {
    const dt = lastSeconds === null ? 0 : Math.min(0.1, Math.max(0, seconds - lastSeconds));
    lastSeconds = seconds;

    // Smoke rises from the chimney; more and faster with speed, a lazy wisp when stalled.
    for (const puff of smoke) {
      const phase = Number(puff.userData.phase) || 0;
      const rise = (seconds * (0.35 + 0.5 * speedFactor) + phase) % 1;
      puff.position.set(body.chimneyTop.x + rise * 160 * (0.3 + speedFactor), body.chimneyTop.y + rise * 120, body.chimneyTop.z);
      puff.scale.setScalar(0.6 + rise * 2.2);
      (puff.material as MeshStandardMaterial).opacity = 0.55 * (1 - rise);
    }


    // Loose items bob and turn a little so they read as things to pick up.
    for (const item of itemsGroup.children) {
      item.position.y = 10 + Math.sin(seconds * 3 + item.id) * 1.5;
      item.rotation.y = seconds * 0.8 + item.id;
    }

    // The firebox glows in time with the engine.
    const glow = mapGroup.getObjectByName("fireboxGlow");
    if (glow instanceof Mesh) (glow.material as MeshStandardMaterial).emissiveIntensity = 1.2 + 0.5 * Math.sin(seconds * 7);

    for (const group of hazardsGroup.children) {
      const kind = group.userData.hazardKind;
      if (kind === "fire") {
        const flame = group.children.find((child) => child.name === "fire");
        if (flame instanceof Mesh) {
          for (const lick of flame.children) {
            if (lick.name !== "flameLick") continue;
            const phase = Number(lick.userData.phase) || 0;
            lick.scale.y = 0.7 + 0.5 * (0.5 + 0.5 * Math.sin(seconds * 15 + phase * 6));
          }
          const flicker = 1 + 0.08 * Math.sin(seconds * 11 + group.id);
          flame.scale.set(FLAME_SCALE * flicker, FLAME_SCALE * (1 + 0.1 * Math.sin(seconds * 9)), FLAME_SCALE * flicker);
          const material = flame.material;
          if (material instanceof MeshStandardMaterial) {
            material.emissiveIntensity = 0.3 + 0.2 * (0.5 + 0.5 * Math.sin(seconds * 13));
          }
        }
      } else if (kind === "breach") {
        for (const puff of group.children) {
          if (puff.userData.kind !== "steam" || !(puff instanceof Mesh)) continue;
          const phase = Number(puff.userData.phase) || 0;
          const rise = (seconds * 0.6 + phase) % 1;
          puff.position.y = 4 + rise * 40;
          puff.scale.setScalar(0.7 + rise * 1.1);
          const material = puff.material;
          if (material instanceof MeshStandardMaterial) material.opacity = 0.55 * (1 - rise);
        }
      }
    }
  };


  /** Crew walk/idle/carry poses and the wheel roll; pure presentation, driven by the frame clock. */
  const updateMotion = (dt: number, factor: number, interactingPlayerId?: string): void => {
    speedFactor = Number.isFinite(factor) ? Math.min(1, Math.max(0, factor)) : 0; // smoke follows it too
    for (const group of playersGroup.children) {
      const motion = group.userData.motion as MotionState | undefined;
      if (!motion) continue;
      const from = { x: motion.lastX, y: motion.lastZ };
      const measured = speedBetween(from, { x: group.position.x, y: group.position.z }, dt);
      motion.speed = smoothSpeed(motion.speed, measured, dt);
      motion.lastX = group.position.x;
      motion.lastZ = group.position.z;
      motion.phase = advanceWalk(motion.phase, motion.speed, dt);
      if (Number.isFinite(dt) && dt > 0) motion.seconds += dt;

      const carrying = group.children.some((child) => child.userData.kind === "heldItem");
      const interacting = interactingPlayerId !== undefined && interactingPlayerId === group.userData.playerId;
      poseFigure(
        group,
        crewPose({ speed: motion.speed, phase: motion.phase, seconds: motion.seconds, carrying, interacting }),
      );
    }
    // The bogie wheels' axles run along z; each tyre turns about its own (local y) axis.
    for (const wheel of body.wheels) wheel.rotation.y = wheelAngle(wheel.rotation.y, speedFactor, dt);
  };

  updateState(world);

  return {
    scene,
    camera,
    playersGroup,
    itemsGroup,
    hazardsGroup,
    mapGroup,
    hullGroup,
    map,
    updateState,
    updateEffects,
    updateMotion,
    updateHighlight: (highlight, seconds) => actionRing.show(highlight, seconds),
    dispose: () => {
      drawnPlayers.clear();
      drawnItems.clear();
      drawnHazards.clear();
      disposeObject(scene);
    },
  };
}
