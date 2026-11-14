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
import type { RenderPlayer } from "./renderPlayer.ts";

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
const LABEL_HEIGHT = 62;
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

  const color = new Color(STATION_COLORS[kind]);
  const pad = new Mesh(new BoxGeometry(44, 6, 44), new MeshStandardMaterial({ color, roughness: 0.7 }));
  pad.position.y = 3;
  pad.userData = { kind: "stationPad", stationKind: kind };
  group.add(pad);

  const post = new Mesh(new BoxGeometry(12, 28, 12), new MeshStandardMaterial({ color, roughness: 0.5 }));
  post.position.y = 20;
  post.userData = { kind: "stationPost", stationKind: kind };
  group.add(post);

  return group;
}

function buildMapGroup(map: TrainMap): Group {
  const group = new Group();
  group.name = "train";

  const floorMaterial = new MeshStandardMaterial({ color: new Color(FLOOR_COLOR), roughness: 0.95 });
  const wallMaterial = new MeshStandardMaterial({ color: new Color(WALL_COLOR), roughness: 0.8 });
  const doorMaterial = new MeshStandardMaterial({ color: new Color(DOOR_COLOR), roughness: 0.6 });

  for (const car of map.cars) {
    const mesh = new Mesh(new BoxGeometry(car.width, FLOOR_THICKNESS, car.depth), floorMaterial);
    mesh.position.set(car.x, -FLOOR_THICKNESS / 2, car.y);
    mesh.name = `car-${car.index}`;
    mesh.userData = { kind: "car", index: car.index };
    group.add(mesh);
  }

  for (const wall of map.walls) {
    const mesh = new Mesh(new BoxGeometry(wall.width, WALL_HEIGHT, wall.depth), wallMaterial);
    mesh.position.set(wall.x, WALL_HEIGHT / 2, wall.y);
    mesh.name = "wall";
    mesh.userData = { kind: "wall" };
    group.add(mesh);
  }

  for (const door of map.doors) {
    const mesh = new Mesh(new BoxGeometry(door.width, DOOR_THICKNESS, door.depth), doorMaterial);
    mesh.position.set(door.x, DOOR_THICKNESS / 2, door.y);
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
  const mesh = new Mesh(
    new BoxGeometry(16 * scale, 12 * scale, 16 * scale),
    new MeshStandardMaterial({ color: new Color(ITEM_COLORS[item.kind]), roughness: 0.6 }),
  );
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

  // A tiny crew member (#217): a colour-coded capsule body, a head, a nose that shows where they
  // face, and a soft shadow on the floor so they read as standing in the car.
  const color = new Color(PLAYER_COLORS[seat % PLAYER_COLORS.length] ?? PLAYER_COLORS[0]);
  const shadow = new Mesh(
    new CylinderGeometry(PLAYER_RADIUS * 1.15, PLAYER_RADIUS * 1.15, 0.5, 20),
    new MeshStandardMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  shadow.position.y = 0.6;
  shadow.name = "shadow";
  group.add(shadow);

  const bodyHeight = PLAYER_HEIGHT * 0.62;
  const body = new Mesh(
    new CapsuleGeometry(PLAYER_RADIUS * 0.85, bodyHeight - PLAYER_RADIUS * 1.7, 6, 16),
    new MeshStandardMaterial({ color, roughness: 0.55 }),
  );
  body.position.y = bodyHeight / 2;
  body.name = `body-${player.id}`;
  body.userData = { kind: "playerBody", playerId: player.id, seat };
  group.add(body);

  const headRadius = PLAYER_RADIUS * 0.62;
  const head = new Mesh(
    new SphereGeometry(headRadius, 16, 12),
    new MeshStandardMaterial({ color: color.clone().lerp(new Color("#ffe0c4"), 0.65), roughness: 0.5 }),
  );
  head.position.y = bodyHeight + headRadius * 0.8;
  head.name = "head";
  group.add(head);

  const nose = new Mesh(new BoxGeometry(5, 4, 4), new MeshStandardMaterial({ color: 0x20202a }));
  nose.position.set(headRadius, head.position.y, 0);
  nose.name = "facing";
  group.add(nose);

  const label = labelFactory(player.name);
  label.position.y = LABEL_HEIGHT;
  group.add(label);

  // A held item is drawn next to its player, not on the floor.
  const held = heldItems.find((item) => item.heldBy === player.id);
  if (held) {
    const mesh = buildItemMesh(held, 0.7);
    mesh.name = `held-${held.id}`;
    mesh.position.set(PLAYER_RADIUS + 8, PLAYER_HEIGHT * 0.6, 0);
    mesh.userData = { ...mesh.userData, kind: "heldItem", heldBy: player.id };
    group.add(mesh);
  }

  placePlayer(group, player);
  return group;
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
    const flame = new Mesh(new ConeGeometry(14, 28, 16), material);
    flame.position.y = 16;
    flame.name = "fire";
    flame.userData = { kind: "hazardShape", hazardKind: hazard.kind };
    group.add(flame);
  } else {
    const mark = new Mesh(new CylinderGeometry(18, 18, 4, 20), material);
    mark.position.y = 4;
    mark.name = hazard.kind === "breach" ? "breach" : "course";
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
  scene.background = new Color("#1a2130");

  const camera = createCamera(map);
  scene.add(camera);

  const ambient = new AmbientLight(0xffffff, 1.2);
  scene.add(ambient);

  const sun = new DirectionalLight(0xffffff, 2.2);
  sun.position.set(mapCentreX(map) - 300, 900, 420);
  scene.add(sun);

  // One group for the hull and everything standing on it, so the course-hazard
  // feedback can roll the train without moving the camera (#219).
  const hullGroup = new Group();
  hullGroup.name = "hull";
  scene.add(hullGroup);

  const mapGroup = buildMapGroup(map);
  hullGroup.add(mapGroup);

  const itemsGroup = new Group();
  itemsGroup.name = "items";
  hullGroup.add(itemsGroup);

  const hazardsGroup = new Group();
  hazardsGroup.name = "hazards";
  hullGroup.add(hazardsGroup);

  const playersGroup = new Group();
  playersGroup.name = "players";
  hullGroup.add(playersGroup);

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
    for (const group of hazardsGroup.children) {
      const kind = group.userData.hazardKind;
      if (kind === "fire") {
        const flame = group.children.find((child) => child.name === "fire");
        if (flame instanceof Mesh) {
          const flicker = 1 + 0.08 * Math.sin(seconds * 11 + group.id);
          flame.scale.set(flicker, 1 + 0.1 * Math.sin(seconds * 9), flicker);
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
    dispose: () => {
      drawnPlayers.clear();
      drawnItems.clear();
      drawnHazards.clear();
      disposeObject(scene);
    },
  };
}
