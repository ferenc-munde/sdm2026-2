// Game constants shared by the rules, the room and the client.
//
// Values marked "plan §3" come from the game numbers table in PLAN.md section 3 (#36).
// Values marked "from #N" come from that issue.
// Values marked "TO CONFIRM" are not fixed yet and get tuned in a play-test.

// --- Players and network ---
// MIN_PLAYERS, MAX_PLAYERS and TICK_RATE also live in config/game.json (#42).
// Once #42 is merged, these should read from there instead of repeating the numbers.
export const MIN_PLAYERS = 2; // plan §2
export const MAX_PLAYERS = 4; // plan §2
export const TICK_RATE = 20; // ticks per second, from #9
export const TICK_SECONDS = 1 / TICK_RATE;
export const JOIN_CODE_LENGTH = 4; // TO CONFIRM
export const PLAYER_NAME_MAX_LENGTH = 16; // TO CONFIRM

// --- Map and movement ---
// Positions are world units on the flat train floor, not pixels. The rules stay 2D;
// the Three.js client maps a floor position (x, y) to the scene as (x, 0, y).
export const CAR_COUNT = 3; // plan §2 (three-car train)
export const PLAYER_SPEED = 160; // units per second, TO CONFIRM
export const PLAYER_RADIUS = 12; // TO CONFIRM
export const INTERACT_RANGE = 40; // max distance to pick up / use a station, TO CONFIRM

// --- Journey ---
export const FUEL_MAX = 100; // from #15 (refuel capped at 100)
export const FUEL_START = 100; // plan §3
export const FUEL_DRAIN_PER_SECOND = 1.8; // plan §3
export const COAL_FUEL = 35; // plan §3
export const HULL_MAX = 100; // plan §3
export const HULL_START = 100; // plan §3
export const WIN_DISTANCE = 1800; // plan §3
export const TRAIN_FULL_SPEED = 10; // distance units per second at speed factor 1.0, plan §3

/** Above this fuel the train runs at full speed; at or below it, half speed. plan §3 */
export const LOW_FUEL_THRESHOLD = 25;
export const SPEED_FACTOR_FULL = 1.0; // plan §3
export const SPEED_FACTOR_LOW = 0.5; // plan §3
export const SPEED_FACTOR_STOPPED = 0; // plan §3 (empty, or engine on fire)

// --- Hazards ---
export const HULL_LOSS_PER_BREACH_PER_SECOND = 2.5; // plan §3
export const HULL_LOSS_PER_FIRE_PER_SECOND = 1.5; // plan §3
export const BREACH_REPAIR_SECONDS = 3; // hold time with the wrench, plan §3
/** Movement multiplier while standing in a breach puddle/vent. */
export const BREACH_MOVEMENT_FACTOR = 0.6; // 40% slower, idea document §3
export const FIRE_EXTINGUISH_SECONDS = 2.5; // hold time with the extinguisher, plan §3
export const FIRE_SPREAD_SECONDS = 15; // plan §2, from #30

/** Seconds between new hazards. plan §3 */
export const HAZARD_INTERVAL_SECONDS = 12;
/** Seconds between new hazards once the late part of the journey starts. plan §3 */
export const HAZARD_INTERVAL_LATE_SECONDS = 7;
/** Share of WIN_DISTANCE after which the late interval applies. plan §3 */
export const HAZARD_LATE_PROGRESS = 0.65;

/**
 * Seconds between new hazards by player count, for scaling the difficulty (#24).
 * TO CONFIRM in a play-test.
 */
export const HAZARD_INTERVAL_BY_PLAYERS: Readonly<Record<number, number>> = {
  2: 14,
  3: 11,
  4: 9,
};

// --- Course hazard (stretch, #28) ---
export const COURSE_WARNING_SECONDS = 5; // from #28
export const COURSE_HOLD_WINDOW_SECONDS = 2; // from #28 (hold in the last 2 seconds)
export const COURSE_HULL_DAMAGE = 12; // from #28
export const COURSE_IMPULSE_SPEED = 450; // idea document §3
export const COURSE_STUN_SECONDS = 1.5; // idea document §3

// --- Throwing (stretch, #29) ---
// A throw flies THROW_SPEED² / (2 × THROW_FRICTION) = 200 units, about half a car, so coal
// thrown near a door lands in the next car. Tune in the play-test (#27).
export const THROW_SPEED = 400; // units per second at release
export const THROW_FRICTION = 400; // deceleration in units per second²
export const ITEM_RADIUS = 8; // a flying item stops this far from a wall
