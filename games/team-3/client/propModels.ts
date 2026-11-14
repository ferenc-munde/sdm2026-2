// Stations, tools and hazards (visual pass, #262): each one shaped like what it is, so players can
// tell a coal bunker from a fire extinguisher at a glance. Drawing only; the rules are unchanged.

import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  Mesh,
  TorusGeometry,
  type Material,
} from "three";
import type { ItemKind, StationKind } from "../shared/types.ts";
import { PALETTE, mat, ownMat } from "./style.ts";

function part(group: Group, geometry: ConstructorParameters<typeof Mesh>[0], material: Material, x: number, y: number, z: number): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

/** The look of each station; its group already sits at the station's position. */
export function buildStationModel(kind: StationKind): Group {
  const g = new Group();
  g.name = `model-${kind}`;
  const iron = mat(PALETTE.iron, { roughness: 0.6, metalness: 0.3 });
  const brass = mat(PALETTE.brass, { roughness: 0.4, metalness: 0.5 });
  switch (kind) {
    case "engine": {
      // The firebox: an iron boiler end with a glowing door.
      part(g, new BoxGeometry(36, 30, 40), iron, 0, 15, 0);
      part(g, new CylinderGeometry(15, 15, 34, 12), iron, 0, 34, 0).rotation.x = Math.PI / 2;
      const door = part(g, new BoxGeometry(2, 12, 16), mat(PALETTE.fire, { emissive: PALETTE.fire, emissiveIntensity: 1.6 }), 18.5, 12, 0);
      door.name = "fireboxGlow";
      part(g, new CylinderGeometry(4, 4, 2, 12), brass, 10, 40, 12).rotation.x = Math.PI / 2; // pressure gauge
      break;
    }
    case "coalDispenser": {
      // A wooden coal bunker heaped with coal.
      const wood = mat(PALETTE.wood);
      part(g, new BoxGeometry(40, 16, 40), wood, 0, 8, 0);
      part(g, new BoxGeometry(42, 3, 42), mat(PALETTE.woodDark), 0, 16, 0);
      const coal = mat(PALETTE.coal, { roughness: 0.9 });
      const lumps: [number, number, number, number][] = [[-8, 20, -6, 7], [6, 21, 4, 8], [-2, 25, 1, 6], [9, 19, -9, 5], [-10, 19, 9, 5]];
      for (const [x, y, z, r] of lumps) part(g, new DodecahedronGeometry(r, 0), coal, x, y, z);
      break;
    }
    case "wrenchRack": {
      // A tool board on legs with a wrench outline.
      part(g, new BoxGeometry(6, 34, 40), mat(PALETTE.woodDark), 0, 17, 0);
      part(g, new BoxGeometry(2, 3, 20), mat(PALETTE.steel, { metalness: 0.6, roughness: 0.3 }), 3.5, 22, 0);
      break;
    }
    case "extinguisherRack": {
      // A red safety cabinet with a white cross band.
      part(g, new BoxGeometry(10, 34, 28), mat(PALETTE.extinguisher), 0, 17, 0);
      part(g, new BoxGeometry(10.5, 4, 28.5), mat("#f2f2f2"), 0, 26, 0);
      break;
    }
    case "steeringConsole": {
      // The brake stand: an iron pedestal with a lever and a red knob.
      part(g, new CylinderGeometry(7, 10, 22, 10), iron, 0, 11, 0);
      part(g, new BoxGeometry(18, 4, 18), brass, 0, 23, 0);
      const lever = part(g, new BoxGeometry(2.5, 22, 2.5), mat(PALETTE.steel, { metalness: 0.6 }), 3, 34, 0);
      lever.rotation.z = -0.35;
      part(g, new DodecahedronGeometry(3.6, 0), mat("#d33a2c"), 6.5, 44, 0);
      break;
    }
  }
  return g;
}

/** A tool or resource. The returned mesh is the item's root, so the scene can tag and move it. */
export function buildItemModel(kind: ItemKind, scale = 1): Mesh {
  let root: Mesh;
  if (kind === "coal") {
    root = new Mesh(new DodecahedronGeometry(7, 0), mat(PALETTE.coal, { roughness: 0.9 }));
    const lump = new Mesh(new DodecahedronGeometry(4.5, 0), mat(PALETTE.coal, { roughness: 0.9 }));
    lump.position.set(5, -1, 3);
    root.add(lump);
  } else if (kind === "wrench") {
    const steel = mat(PALETTE.steel, { metalness: 0.7, roughness: 0.3 });
    root = new Mesh(new BoxGeometry(18, 2.5, 3.5), steel); // handle
    const jaw = new Mesh(new TorusGeometry(4, 1.6, 6, 10, Math.PI * 1.4), steel);
    jaw.rotation.x = Math.PI / 2;
    jaw.position.x = 11;
    root.add(jaw);
  } else {
    root = new Mesh(new CylinderGeometry(4.5, 4.5, 18, 12), mat(PALETTE.extinguisher, { roughness: 0.45 }));
    const top = new Mesh(new CylinderGeometry(2, 3, 4, 8), mat(PALETTE.iron));
    top.position.y = 11;
    root.add(top);
    const nozzle = new Mesh(new BoxGeometry(7, 1.6, 1.6), mat(PALETTE.iron));
    nozzle.position.set(4, 12.5, 0);
    root.add(nozzle);
    // Stand it up: the root's origin is its middle.
  }
  root.scale.setScalar(scale);
  root.castShadow = true;
  for (const child of root.children) child.castShadow = true;
  return root;
}

/** How much larger than its base shapes a fire is drawn; the flicker scales around this. */
export const FLAME_SCALE = 1.45;

/** A fire: an outer flame plus a bright core and licks around it, all flickered by the scene. */
export function buildFlame(): Mesh {
  const outer = new Mesh(new ConeGeometry(13, 30, 7), ownMat(PALETTE.fire, { emissive: PALETTE.fire, emissiveIntensity: 0.9 }));
  const core = new Mesh(new ConeGeometry(7, 20, 6), mat(PALETTE.fireCore, { emissive: PALETTE.fireCore, emissiveIntensity: 1.4 }));
  core.position.y = -3;
  core.name = "flameCore";
  outer.add(core);
  for (let i = 0; i < 3; i += 1) {
    const lick = new Mesh(new ConeGeometry(4.5, 14, 5), mat(PALETTE.fire, { emissive: PALETTE.fire, emissiveIntensity: 1.1 }));
    const angle = (i / 3) * Math.PI * 2;
    lick.position.set(Math.cos(angle) * 9, -8, Math.sin(angle) * 9);
    lick.name = "flameLick";
    lick.userData = { phase: i / 3 };
    outer.add(lick);
  }
  // A glowing bed of embers on the floor under the flames, so the fire reads from far away.
  const embers = new Mesh(new CylinderGeometry(20, 22, 2, 9), mat("#ff5a1a", { emissive: "#ff4a10", emissiveIntensity: 1.2 }));
  embers.position.y = -21;
  outer.add(embers);
  outer.scale.setScalar(FLAME_SCALE);
  return outer;
}

/** A breach: a burst steam pipe over a spreading puddle. */
export function buildBreachModel(): Group {
  const g = new Group();
  g.name = "breachModel";
  const puddle = new Mesh(new CylinderGeometry(20, 20, 0.8, 14), ownMat(PALETTE.water, { opacity: 0.6, emissive: PALETTE.water, emissiveIntensity: 0.25 }));
  puddle.position.y = 0.6;
  g.add(puddle);
  const pipe = new Mesh(new CylinderGeometry(3.2, 3.2, 26, 8), mat(PALETTE.ironLight, { metalness: 0.4 }));
  pipe.rotation.z = Math.PI / 2;
  pipe.position.y = 5;
  pipe.castShadow = true;
  g.add(pipe);
  const split = new Mesh(new TorusGeometry(3.6, 1.2, 5, 8), mat(PALETTE.iron));
  split.rotation.y = Math.PI / 2;
  split.position.set(2, 5, 0);
  g.add(split);
  return g;
}
