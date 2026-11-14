// The crew (visual pass, #262 and #294): a small stylised railway engineer built from a few shapes,
// with a cap and overalls in the player's colour, and a walk / idle / carry animation driven by how
// the figure actually moves on screen. Drawing only: the room decides where everyone is.

import { BoxGeometry, CapsuleGeometry, CylinderGeometry, Group, Mesh, SphereGeometry, type Color, type Object3D } from "three";
import { PALETTE, mat, ownMat } from "./style.ts";

/** Overall height of a crew member, in world units (the player's collision radius is 12). */
export const CREW_HEIGHT = 38;

const geometry = {
  leg: new CapsuleGeometry(2.6, 7, 3, 8),
  boot: new BoxGeometry(5, 3, 6.5),
  torso: new CapsuleGeometry(6.5, 7, 4, 10),
  arm: new CapsuleGeometry(2.1, 7.5, 3, 8),
  hand: new SphereGeometry(2.2, 8, 6),
  head: new SphereGeometry(6.2, 12, 10),
  cap: new CylinderGeometry(6.4, 6.6, 3.6, 12),
  brim: new BoxGeometry(5, 1.2, 9),
  nose: new SphereGeometry(1.4, 6, 5),
  shadow: new CylinderGeometry(11, 11, 0.4, 18),
  strap: new BoxGeometry(1.4, 9, 13.4),
};

/** A limb that swings from its top: the mesh hangs below a pivot group. */
function limb(name: string, mesh: Mesh, length: number, x: number, y: number, z: number): Group {
  const pivot = new Group();
  pivot.name = name;
  pivot.position.set(x, y, z);
  mesh.position.y = -length / 2;
  mesh.castShadow = true;
  pivot.add(mesh);
  return pivot;
}

/**
 * Builds a crew member facing +x. `body` is returned separately so the scene can tag it as the
 * player's body (its material carries the player colour).
 */
export function buildCrewFigure(color: Color): { figure: Group; body: Mesh } {
  const figure = new Group();
  figure.name = "crew";
  const colour = mat(color, { roughness: 0.6 });
  const skin = mat(PALETTE.skin, { roughness: 0.7 });
  const dark = mat(PALETTE.iron, { roughness: 0.8 });

  const shadow = new Mesh(geometry.shadow, ownMat(0x000000, { opacity: 0.3 }));
  shadow.position.y = 0.5;
  shadow.name = "shadow";
  figure.add(shadow);

  // Hips: everything above swings and bobs together.
  const hips = new Group();
  hips.name = "hips";
  hips.position.y = 13;
  figure.add(hips);

  for (const side of [-1, 1]) {
    const leg = limb(side < 0 ? "legL" : "legR", new Mesh(geometry.leg, mat(PALETTE.overalls)), 12, 0, 0, side * 3.4);
    const boot = new Mesh(geometry.boot, dark);
    boot.position.set(1.2, -12.2, 0);
    boot.castShadow = true;
    leg.add(boot);
    hips.add(leg);
  }

  // The body is the player's colour (a work jacket), with dark overall straps over it.
  const body = new Mesh(geometry.torso, colour);
  body.position.y = 8.5;
  body.castShadow = true;
  hips.add(body);
  for (const side of [-1, 1]) {
    const strap = new Mesh(geometry.strap, mat(PALETTE.overalls));
    strap.position.set(0, 9, side * 2.6);
    strap.scale.set(1, 1, 0.18);
    hips.add(strap);
  }

  for (const side of [-1, 1]) {
    const arm = limb(side < 0 ? "armL" : "armR", new Mesh(geometry.arm, colour), 11, 0, 15, side * 8.4);
    const hand = new Mesh(geometry.hand, skin);
    hand.position.y = -12;
    arm.add(hand);
    hips.add(arm);
  }

  const head = new Mesh(geometry.head, skin);
  head.name = "head";
  head.position.y = 24.5;
  head.castShadow = true;
  hips.add(head);

  const cap = new Mesh(geometry.cap, colour);
  cap.position.y = 29.2;
  hips.add(cap);
  const brim = new Mesh(geometry.brim, colour);
  brim.name = "facing"; // the cap's brim points where the crew member faces
  brim.position.set(5.5, 27.6, 0);
  hips.add(brim);
  const nose = new Mesh(geometry.nose, skin);
  nose.position.set(6, 24, 0);
  hips.add(nose);

  return { figure, body };
}

/** Where a held item sits: in front of the chest, between the hands. */
export const HOLD_POINT = { x: 12, y: 20, z: 0 } as const;

/** One frame of a crew member's pose; pure so it can be tested. */
export interface CrewPose {
  legSwing: number;
  armSwing: number;
  bob: number;
  lean: number;
}

/**
 * The pose `seconds` into the animation for a figure moving at `speed` (world units per second).
 * Walking swings legs and arms with the stride; standing still breathes; carrying keeps the arms
 * forward around the item.
 */
export function crewPose(seconds: number, speed: number, carrying: boolean): CrewPose {
  const walk = Math.min(1, speed / 140); // full stride at walking speed (160)
  const stride = Math.sin(seconds * 13);
  const legSwing = walk * 0.75 * stride;
  const idle = (1 - walk) * Math.sin(seconds * 2.4) * 0.35;
  return {
    legSwing,
    // A limb hangs along -y, so a positive turn about z swings it forward (+x).
    armSwing: carrying ? 1.25 : -walk * 0.7 * stride,
    bob: walk * Math.abs(stride) * 1.6 + idle,
    lean: walk * 0.12,
  };
}

/** Applies a pose to a figure built by `buildCrewFigure`. */
export function applyCrewPose(figure: Object3D, pose: CrewPose, carrying: boolean): void {
  const hips = figure.getObjectByName("hips");
  if (!hips) return;
  hips.position.y = 13 + pose.bob;
  hips.rotation.z = -pose.lean; // lean into the walk (+x is forward)
  const set = (name: string, angle: number) => {
    const part = hips.getObjectByName(name);
    if (part) part.rotation.z = angle;
  };
  set("legL", pose.legSwing);
  set("legR", -pose.legSwing);
  if (carrying) {
    set("armL", pose.armSwing);
    set("armR", pose.armSwing);
  } else {
    set("armL", pose.armSwing);
    set("armR", -pose.armSwing);
  }
}
