// Game constants shared by the rules, the server and the client.
//
// Values marked "from #N" are taken from that issue.
// Values marked "TO CONFIRM" are placeholders until PLAN.md section 3 (issue #3)
// fixes them; update them here once the plan is merged.

// --- Players and network ---
export const MIN_PLAYERS = 2; // from #24 (tuned for 2, 3 and 4 players)
export const MAX_PLAYERS = 4; // from #24
export const TICK_RATE = 20; // ticks per second, from #9
export const TICK_SECONDS = 1 / TICK_RATE;
export const JOIN_CODE_LENGTH = 4; // TO CONFIRM
export const PLAYER_NAME_MAX_LENGTH = 16; // TO CONFIRM

// --- Map and movement (world units = pixels) ---
export const CAR_COUNT = 3; // from #6 (three-car train)
export const PLAYER_SPEED = 160; // units per second, TO CONFIRM
export const PLAYER_RADIUS = 12; // TO CONFIRM
export const INTERACT_RANGE = 40; // max distance to pick up / use a station, TO CONFIRM

// --- Journey ---
export const FUEL_MAX = 100; // from #15 (refuel capped at 100)
export const FUEL_START = 100; // TO CONFIRM
export const FUEL_DRAIN_PER_SECOND = 1.8; // from #13
export const COAL_FUEL = 35; // from #15
export const HULL_MAX = 100; // TO CONFIRM
export const HULL_START = 100; // TO CONFIRM
export const WIN_DISTANCE = 1800; // from #13
export const TRAIN_FULL_SPEED = 10; // distance units per second at speed factor 1.0, TO CONFIRM

/** Fuel at or below this gives half speed (factor 0.5); 0 fuel gives factor 0. TO CONFIRM */
export const LOW_FUEL_THRESHOLD = 25;
export const SPEED_FACTOR_FULL = 1.0; // from #13
export const SPEED_FACTOR_LOW = 0.5; // from #13
export const SPEED_FACTOR_STOPPED = 0; // from #13

// --- Hazards ---
export const HULL_LOSS_PER_BREACH_PER_SECOND = 2.5; // from #13
export const HULL_LOSS_PER_FIRE_PER_SECOND = 1.5; // from #13
export const BREACH_REPAIR_SECONDS = 3; // hold time with the wrench, TO CONFIRM (#16)
export const FIRE_EXTINGUISH_SECONDS = 2; // hold time with the extinguisher, TO CONFIRM (#17)
export const FIRE_SPREAD_SECONDS = 15; // from #30

/** Seconds between new hazards, by player count. TO CONFIRM in a play-test (#24). */
export const HAZARD_INTERVAL_SECONDS: Readonly<Record<number, number>> = {
  2: 14,
  3: 11,
  4: 9,
};

// --- Course hazard (stretch, #28) ---
export const COURSE_WARNING_SECONDS = 5; // from #28
export const COURSE_HOLD_WINDOW_SECONDS = 2; // from #28 (hold in the last 2 seconds)
export const COURSE_HULL_DAMAGE = 12; // from #28

// --- Throwing (stretch, #29) ---
export const THROW_SPEED = 320; // units per second at release, TO CONFIRM
export const THROW_FRICTION = 640; // deceleration in units per second², TO CONFIRM
