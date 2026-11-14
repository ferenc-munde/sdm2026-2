/** Map artwork coordinates only. Gameplay state and station rules live elsewhere. */
// The geometry the rules also need (movement bounds) lives in shared/map.ts.
import { carBounds, PASSAGE_WIDTH, PASSAGE_X } from "../shared/map.ts";
export { CAR_HEIGHT, CAR_SPACING, CAR_START_Y, CAR_WIDTH, CAR_X } from "../shared/map.ts";

/** Beacon colour per task type: scene light columns and HUD chips share it. */
export const TASK_TYPE_COLORS: Record<string, string> = {
  POWER: "#e4b552",
  PRESSURE: "#62cdd3",
  FIRE: "#e46c63",
  NAVIGATION: "#6f9bea",
  CARGO: "#cc8c45",
};
export const taskColor = (type: string): string => TASK_TYPE_COLORS[type] ?? "#fff1ca";

export interface MapStation {
  id: string;
  label: string;
  x: number;
  y: number;
  color: string;
}

const definitions = [
  { name: "Command & Guidance", floor: "#4b6263", color: "#4fa7c1", stations: [
    ["nav-left", "NAV A"], ["nav-right", "NAV B"], ["emergency-brake", "BRAKE"], ["route-map", "ROUTE MAP"],
  ] },
  { name: "Core Propulsion & Boiler", floor: "#70604c", color: "#cc8c45", stations: [
    ["boiler", "BOILER"], ["intake-valves", "VALVES"], ["furnace-fuel", "FUEL SLOT"],
  ] },
  { name: "Mechanical Junction", floor: "#4d6359", color: "#71a98d", stations: [
    ["breaker-box", "BREAKER"], ["pipe-junction", "PIPES"], ["coolant-pump", "PUMP"],
    ["wrench-locker", "WRENCH"], ["extinguisher-locker", "EXTING."],
  ] },
  { name: "Cargo & Storage Hold", floor: "#6b614b", color: "#b69a59", stations: [
    ["coal-bin", "COAL"], ["parts-bin", "PARTS"], ["battery-bin", "BATTERIES"],
    ["spare-fuses", "FUSES"], ["extinguisher-refill", "REFILL"],
  ] },
  { name: "Caboose / Generator", floor: "#5e5267", color: "#a287bb", stations: [
    ["generator-crank", "GENERATOR"], ["observation-platform", "LOOKOUT"], ["track-switcher", "SWITCH"],
  ] },
] as const;

export const TRAIN_CARS = definitions.map((definition, index) => {
  const bounds = carBounds(index);
  const y = bounds.y;
  return {
    index, name: definition.name, floor: definition.floor,
    bounds,
    stations: definition.stations.map(([id, label], slot): MapStation => ({
      id, label, color: definition.color,
      // Keep a clear central aisle between both banks of equipment.
      x: slot % 2 === 0 ? 712 : 830,
      y: y + 26 + Math.floor(slot / 2) * 38,
    })),
  };
});

export const TRAIN_PASSAGES = TRAIN_CARS.slice(0, -1).map(car => ({
  id: `bulkhead-${car.index + 1}`,
  fromCar: car.index,
  toCar: car.index + 1,
  bounds: { x: PASSAGE_X, y: car.bounds.y + 142, width: PASSAGE_WIDTH, height: 42 },
  hatch: { x: 846, y: car.bounds.y + 139, width: 24, height: 14 },
}));
