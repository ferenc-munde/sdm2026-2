// The Last Train's look (visual pass, #262): one palette and one material style for the train,
// the crew, the props and the scenery, so everything reads as the same world.
//
// Direction: warm, stylised low-poly. Flat-shaded materials (facets catch the light), a deep red
// train with brass trim and wooden floors, dark iron for machinery, a dusky green countryside.
// Materials are shared and cached: many meshes, few materials, cheap to draw for four players.

import { Color, MeshStandardMaterial, type ColorRepresentation } from "three";

export const PALETTE = {
  // Train
  paint: "#8c2f24",
  paintDark: "#5e1f18",
  brass: "#c9a227",
  wood: "#7a5536",
  woodDark: "#5a3d27",
  iron: "#34373f",
  ironLight: "#5c616d",
  glass: "#9fc4d8",
  lamp: "#ffd27a",
  // Scenery
  grass: "#3f5a2c",
  grassLight: "#55753a",
  ballast: "#6f675c",
  sleeper: "#4b3626",
  rail: "#aab3c0",
  trunk: "#5a4030",
  leaves: "#2f5a2a",
  leavesLight: "#3f7434",
  rock: "#7d7a74",
  hill: "#2c3f2a",
  grassDark: "#36502a",
  fence: "#6b5038",
  flowerWhite: "#f1ece0",
  flowerYellow: "#f2c94c",
  flowerPink: "#e58fa8",
  milepost: "#e9e4d8",
  sky: "#2a3550",
  fog: "#3a4560",
  // Props
  coal: "#1d1d22",
  steel: "#b8bec8",
  extinguisher: "#d33a2c",
  fire: "#ff7a1a",
  fireCore: "#ffd23f",
  water: "#4a8fe0",
  steam: "#dfe7f2",
  skin: "#f1c9a5",
  overalls: "#3b4a63",
} as const;

/**
 * Evening light shared by the train and the platform (#358): a low warm sun with longer shadows,
 * a cool sky fill and a warm ground bounce. Less flat ambient, so shapes read by their shading.
 */
export const LIGHTING = {
  ambient: 0.22,
  skyColor: "#a9b8de",
  groundColor: "#5a4128",
  hemisphere: 0.95,
  sunColor: "#ffcb8e",
  sunIntensity: 3.1,
  /** Sun offset from the scene centre: low and to the side, so shadows stretch across the floor. */
  sunOffset: { x: -650, y: 720, z: 560 },
  /** One soft warm light per carriage, under its far-wall lamps: no shadows, short reach. */
  carLamp: { color: "#ffcf8a", intensity: 2600, distance: 330, height: 46 },
  /** The locomotive's headlamp glow, just in front of the lamp. */
  headlamp: { color: "#ffd99a", intensity: 3500, distance: 260 },
} as const;

const cache = new Map<string, MeshStandardMaterial>();

/** A shared flat-shaded material. Pass `emissive` for glowing parts (lamps, fire, the firebox). */
export function mat(
  color: ColorRepresentation,
  options: { roughness?: number; metalness?: number; emissive?: ColorRepresentation; emissiveIntensity?: number } = {},
): MeshStandardMaterial {
  const key = JSON.stringify([new Color(color).getHex(), options]);
  let material = cache.get(key);
  if (!material) {
    material = new MeshStandardMaterial({
      color,
      roughness: options.roughness ?? 0.75,
      metalness: options.metalness ?? 0,
      flatShading: true,
      emissive: options.emissive ?? 0x000000,
      emissiveIntensity: options.emissiveIntensity ?? 1,
    });
    cache.set(key, material);
  }
  return material;
}

/** A material of its own (not shared), for parts whose colour or opacity is animated per object. */
export function ownMat(
  color: ColorRepresentation,
  options: { roughness?: number; emissive?: ColorRepresentation; emissiveIntensity?: number; opacity?: number } = {},
): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.6,
    flatShading: true,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 1,
    transparent: options.opacity !== undefined,
    opacity: options.opacity ?? 1,
    depthWrite: options.opacity === undefined,
  });
}

/** Deterministic pseudo-random numbers for placing scenery, so every browser draws the same world. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
