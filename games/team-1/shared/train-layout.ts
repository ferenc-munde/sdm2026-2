// The train floor plan as the rules see it. The numbers mirror the Three.js scene
// (TRAIN_LAYOUT in client/environment/TrainEnvironment.ts and PLAYER_INSET in
// client/player-scene.ts). Nothing checks that automatically: keep them in sync by hand.

/** Five sections along the train, from the front (x = 0) to the rear (x = 1). */
export const SECTIONS = ["engine", "electrical", "control", "passenger", "rear"] as const;
export type SectionId = (typeof SECTIONS)[number];

export const SECTION_TITLES: Record<SectionId, string> = {
  engine: "Engine Room",
  electrical: "Electrical Room",
  control: "Control Cabin",
  passenger: "Passenger Carriage",
  rear: "Rear Carriage",
};

/** World size of the whole train floor. */
export const TRAIN_SIZE = { length: 26, width: 10 } as const;

/** How far players stay from the outer walls, in world units. */
export const PLAYER_INSET = { length: 1.5, width: 1.25 } as const;

/** The area a player can stand in. A normalised position (0..1, 0..1) maps onto this rectangle. */
export const WALKABLE = {
  length: TRAIN_SIZE.length - PLAYER_INSET.length * 2,
  width: TRAIN_SIZE.width - PLAYER_INSET.width * 2,
} as const;

/** The section a normalised x position (0..1) lies in. */
export function sectionAt(x: number): SectionId {
  const distanceFromFront = PLAYER_INSET.length + Math.min(1, Math.max(0, x)) * WALKABLE.length;
  const sectionLength = TRAIN_SIZE.length / SECTIONS.length;
  const index = Math.min(SECTIONS.length - 1, Math.floor(distanceFromFront / sectionLength));
  return SECTIONS[index] ?? "rear";
}

export interface TaskDefinition {
  id: string;
  label: string;
  /** A player must stand in this section to work on the task. */
  section: SectionId;
}

/** Every repair the game knows. A run uses `taskCount` of them (config/game.json). */
export const TASK_CATALOGUE: readonly TaskDefinition[] = [
  { id: "wiring", label: "Reconnect the signal wires", section: "electrical" },
  { id: "boiler", label: "Stabilize the boiler", section: "engine" },
  { id: "brakes", label: "Inspect the carriage brakes", section: "rear" },
];
