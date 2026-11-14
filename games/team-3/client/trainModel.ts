// The train's body (visual pass, #262): a steam locomotive at the front, an undercarriage with
// bogies and wheels under every car, couplings and gangways between the cars, and a cut-away
// carriage body: tall windowed walls on the far side, low walls on the near side so the camera
// sees inside. The collision walls and floors stay exactly where the rules have them.

import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SphereGeometry,
  SRGBColorSpace,
  type Material,
  type Object3D,
  type Texture,
} from "three";
import type { TrainMap } from "../shared/map/map.ts";
import { PALETTE, mat, ownMat } from "./style.ts";

/** How far the locomotive reaches in front of the first car, so the camera can frame it. */
export const LOCOMOTIVE_LENGTH = 170;
/** Wall heights: the far side is a full carriage wall; the near side stays low so the inside shows. */
export const FAR_WALL_HEIGHT = 52;
export const NEAR_WALL_HEIGHT = 16;
export const END_WALL_HEIGHT = 34;
const FLOOR_THICKNESS = 8;
const WHEEL_RADIUS = 13;
/** Top of the rails (scenery.ts: SCENERY_Y + sleeper + rail heights): every wheel rests on it. */
const RAIL_TOP = -36;

function add(parent: Object3D, geometry: ConstructorParameters<typeof Mesh>[0], material: Material, x: number, y: number, z: number, name = "trainDetail"): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.name = name;
  mesh.userData = { kind: "trainDetail" };
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** A wheel: a dark disc with a brass hub, turned by the scene with the train's speed. */
function wheel(parent: Object3D, x: number, z: number, radius = WHEEL_RADIUS): Mesh {
  const tyre = add(parent, new CylinderGeometry(radius, radius, 5, 14), mat(PALETTE.iron, { metalness: 0.4, roughness: 0.5 }), x, RAIL_TOP + radius, z, "wheel");
  tyre.userData = { kind: "wheel" };
  tyre.rotation.x = Math.PI / 2;
  const hub = new Mesh(new CylinderGeometry(radius * 0.35, radius * 0.35, 5.6, 8), mat(PALETTE.brass, { metalness: 0.5 }));
  tyre.add(hub);
  const spoke = new Mesh(new BoxGeometry(radius * 1.7, 5.4, 2), mat(PALETTE.ironLight));
  tyre.add(spoke); // a visible spoke so the turning shows
  return tyre;
}

export interface TrainBody {
  group: Group;
  wheels: Mesh[];
  /** Where smoke leaves the chimney, in train coordinates. */
  chimneyTop: { x: number; y: number; z: number };
}

/** A small brass number plate texture (#355); null outside a browser, where tests build the plate plain. */
function plateTexture(number: number): Texture | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 48;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = PALETTE.brass;
  context.fillRect(0, 0, 64, 48);
  context.strokeStyle = PALETTE.woodDark;
  context.lineWidth = 3;
  context.strokeRect(2, 2, 60, 44);
  context.fillStyle = "#2b2117";
  context.font = "bold 32px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(String(number), 32, 26);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export function buildTrainBody(map: TrainMap): TrainBody {
  const group = new Group();
  group.name = "trainBody";
  const wheels: Mesh[] = [];
  const iron = mat(PALETTE.iron, { metalness: 0.3, roughness: 0.6 });
  const paint = mat(PALETTE.paint, { roughness: 0.55 });
  const paintDark = mat(PALETTE.paintDark, { roughness: 0.6 });
  const brass = mat(PALETTE.brass, { metalness: 0.5, roughness: 0.4 });
  const glass = ownMat(PALETTE.glass, { opacity: 0.35, roughness: 0.1 });
  const wood = mat(PALETTE.woodDark);

  for (const car of map.cars) {
    const left = car.x - car.width / 2;
    const far = car.y - car.depth / 2;
    // Undercarriage: a dark frame under the floor, a bogie with two axles at each end.
    add(group, new BoxGeometry(car.width - 30, 10, car.depth - 60), iron, car.x, -FLOOR_THICKNESS - 5, car.y);
    for (const end of [left + 55, left + car.width - 55]) {
      add(group, new BoxGeometry(70, 8, car.depth - 20), mat(PALETTE.ironLight), end, -FLOOR_THICKNESS - 12, car.y);
      for (const dx of [-20, 20]) {
        for (const side of [-1, 1]) wheels.push(wheel(group, end + dx, car.y + side * (car.depth / 2 - 4)));
      }
    }
    // Floor planks: thin dark seams across the wooden floor.
    for (let x = left + 30; x < left + car.width - 10; x += 30) {
      add(group, new BoxGeometry(1.5, 0.6, car.depth - 22), wood, x, 0.35, car.y);
    }
    // Far wall windows: framed glass in the upper half, with pillars between, and a roof edge.
    const windowY = (FAR_WALL_HEIGHT + 22) / 2 + 4;
    for (let x = left + 40; x < left + car.width - 30; x += 60) {
      add(group, new BoxGeometry(40, 18, 1.5), glass, x + 10, windowY, far + 6);
      add(group, new BoxGeometry(44, 2.5, 3), brass, x + 10, windowY - 10, far + 6.5);
    }
    add(group, new BoxGeometry(car.width + 4, 6, 26), paintDark, car.x, FAR_WALL_HEIGHT + 3, far + 8); // roof edge
    add(group, new BoxGeometry(car.width + 6, 2, 28), brass, car.x, FAR_WALL_HEIGHT + 6.5, far + 8);
    // Lamp over each door end, glowing warm.
    add(group, new SphereGeometry(3.2, 8, 6), mat(PALETTE.lamp, { emissive: PALETTE.lamp, emissiveIntensity: 1.5 }), car.x, FAR_WALL_HEIGHT - 6, far + 12);

    // Carriage details (#355), all decoration: a runner rug in the middle, small warm lamps
    // between the windows, and a brass number plate near the front of the car.
    const rug = add(
      group,
      new BoxGeometry(car.width * 0.52, 0.8, car.depth * 0.42),
      paintDark,
      car.x,
      0.8,
      car.y,
      `car-rug-${car.index}`,
    );
    rug.userData = { kind: "trainDetail", carDetail: "rug", car: car.index };
    rug.castShadow = false; // flat on the floor; it should not shadow the crew

    const warmLamp = mat(PALETTE.lamp, { emissive: PALETTE.lamp, emissiveIntensity: 1.6 });
    for (let x = left + 90; x < left + car.width - 40; x += 120) {
      const lamp = add(group, new BoxGeometry(5, 9, 2.5), warmLamp, x, 32, far + 7, `car-lamp-${car.index}-${x}`);
      lamp.userData = { kind: "trainDetail", carDetail: "lamp", car: car.index };
      lamp.castShadow = false;
      const bracket = add(group, new BoxGeometry(9, 2, 3), brass, x, 37.5, far + 7, `car-lamp-bracket-${car.index}-${x}`);
      bracket.userData = { kind: "trainDetail", carDetail: "lampBracket", car: car.index };
    }

    const plate = add(group, new BoxGeometry(18, 13, 1.6), brass, left + 26, 20, far + 6.4, `car-plate-${car.index}`);
    plate.userData = { kind: "trainDetail", carDetail: "plate", car: car.index };
    const numberTexture = plateTexture(car.index + 1);
    if (numberTexture) {
      const number = new Mesh(new PlaneGeometry(16, 11), new MeshBasicMaterial({ map: numberTexture }));
      number.position.set(left + 26, 20, far + 7.3);
      number.name = `car-number-${car.index}`;
      number.userData = { kind: "trainDetail", carDetail: "number", car: car.index };
      group.add(number);
    }
  }

  // Couplings under each gangway between two cars.
  for (const door of map.doors) {
    add(group, new BoxGeometry(door.width + 20, 6, 14), iron, door.x, -FLOOR_THICKNESS - 4, door.y);
    add(group, new BoxGeometry(door.width - 4, 26, 3), paintDark, door.x, 13, door.y - 60); // bellows, far side
  }

  // The locomotive, in front of the first car: boiler, smokebox, chimney, dome, cab front, cowcatcher, lamp.
  const first = map.cars[0]!;
  const nose = first.x - first.width / 2;
  const loco = new Group();
  loco.name = "locomotive";
  group.add(loco);
  const cx = nose - LOCOMOTIVE_LENGTH / 2;
  add(loco, new BoxGeometry(LOCOMOTIVE_LENGTH, 12, first.depth - 50), iron, cx, -FLOOR_THICKNESS - 2, first.y); // running board
  const boiler = add(loco, new CylinderGeometry(44, 44, LOCOMOTIVE_LENGTH - 40, 16), paint, cx + 10, 40, first.y);
  boiler.rotation.z = Math.PI / 2;
  for (const ring of [-40, 0, 40]) {
    const band = add(loco, new CylinderGeometry(45, 45, 3, 16), brass, cx + 10 + ring, 40, first.y);
    band.rotation.z = Math.PI / 2;
  }
  const smokebox = add(loco, new CylinderGeometry(46, 46, 26, 16), iron, nose - LOCOMOTIVE_LENGTH + 33, 40, first.y);
  smokebox.rotation.z = Math.PI / 2;
  const chimneyX = nose - LOCOMOTIVE_LENGTH + 38;
  add(loco, new CylinderGeometry(9, 12, 34, 10), iron, chimneyX, 96, first.y);
  add(loco, new CylinderGeometry(14, 10, 8, 10), iron, chimneyX, 114, first.y);
  add(loco, new SphereGeometry(16, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), brass, cx + 20, 82, first.y); // steam dome
  add(loco, new SphereGeometry(7, 10, 8), mat(PALETTE.lamp, { emissive: PALETTE.lamp, emissiveIntensity: 2 }), nose - LOCOMOTIVE_LENGTH + 18, 60, first.y);
  const cowcatcher = add(loco, new CylinderGeometry(4, 40, 30, 4), iron, nose - LOCOMOTIVE_LENGTH + 4, 2, first.y);
  cowcatcher.rotation.z = Math.PI / 2;
  cowcatcher.rotation.x = Math.PI / 4;
  for (const dx of [-45, 0, 45]) {
    for (const side of [-1, 1]) wheels.push(wheel(loco, cx + 15 + dx, first.y + side * (first.depth / 2 - 30), dx === 0 ? 20 : 16));
  }

  return { group, wheels, chimneyTop: { x: chimneyX, y: 120, z: first.y } };
}
