import { LOW_FUEL_THRESHOLD } from "../shared/constants.ts";
import type { GameState, HazardKind } from "../shared/types.ts";

export type AnnouncementEvent =
  | { kind: "hazard"; hazard: HazardKind; car: number }
  | { kind: "lowFuel" };

/** State transitions only: repeated room patches never repeat a warning. */
export function announcementEvents(previous: GameState | null, next: GameState): AnnouncementEvent[] {
  if (next.phase !== "playing") return [];
  const events: AnnouncementEvent[] = [];
  for (const hazard of Object.values(next.hazards).sort((a, b) => a.id.localeCompare(b.id))) {
    if (previous?.phase !== "playing" || !previous.hazards[hazard.id]) {
      events.push({ kind: "hazard", hazard: hazard.kind, car: hazard.car });
    }
  }
  if (next.journey.fuel <= LOW_FUEL_THRESHOLD &&
      (previous?.phase !== "playing" || previous.journey.fuel > LOW_FUEL_THRESHOLD)) {
    events.push({ kind: "lowFuel" });
  }
  return events;
}

export function fallbackAnnouncement(event: AnnouncementEvent): string {
  if (event.kind === "lowFuel") return "Crew, fuel is running low. Bring coal to the engine!";
  if (event.hazard === "course") return "Sharp curve ahead: hold the brake lever during the final two seconds!";
  const location = `car ${event.car + 1}`;
  return event.hazard === "fire"
    ? `Fire in ${location}! Bring the extinguisher and hold interact.`
    : `Broken steam pipe in ${location}! Bring a wrench and hold interact.`;
}
