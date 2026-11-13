# `shared/`: the game rules

Everything that decides what happens in The Last Train lives here, as **pure, deterministic functions with tests**: the same state, input and elapsed time always give the same result. There's no clock, no `Math.random()` (a seeded random source is passed in), and no DOM or Node imports, so the server runs these rules and the browser can import them too. Rules for writing code here: [../DEVELOPMENT.md](../DEVELOPMENT.md#rules-for-code-in-shared).

## How a run fits together

```
 main menu ─► LOBBY (on the platform)                      ─► RUN (on the train)                 ─► won / lost
              joinSession  → host, crew size (lobby)           stepSession, 20 times a second:        playAgainOnPlatform
              configureRoom (host: crew size 2–4)                clock → movement → journey →           → back to the lobby
              stepLobby    → walk on the platform                  breaches → fires → course → spread
              practice stations, how-to-play boards                → hazard director → win / lose
              departAndBoard (host, crew complete)  ──────►      pickUpOrDrop / coal stations on demand
```

The room (temporary server #145, later `@sdm/host` #80) holds one `GameSession` per room and calls these functions. Players only send inputs; the state is never trusted from a client.

## Modules

### Contract
| File | What it is | By |
|---|---|---|
| [types.ts](types.ts) | The game state: players, items, hazards, stations, journey, lobby, phase | `Abmuminfav` (#34, #162) |
| [messages.ts](messages.ts) | Every client → server and server → client message, and the error codes | `Abmuminfav` (#34, #162) |
| [constants.ts](constants.ts) | Every game number from PLAN.md section 3, checked by `contract.test.ts` | `Abmuminfav` (#34) |
| [config.ts](config.ts) | Room settings from `config/game.json` (tick rate, max players, reconnect time) | `favyabils234-hash` (#42) |

### World and movement
| File | What it does | By |
|---|---|---|
| [map/map.ts](map/map.ts) | The three-car train: walls, narrow doors, stations, hazard spots, item and player starts; `validateMap` | `Abmuminfav` (#83) |
| [map/platform.ts](map/platform.ts) | The lobby platform: walls, player starts, and where the platform objects stand; `validatePlatform` | `Abmuminfav` (#182) |
| [movement/movement.ts](movement/movement.ts) | Walking in 8 directions at constant speed, stopping at walls, passing doors; works on any map with walls | `Abmuminfav` (#86) |

### The run
| File | What it does | By |
|---|---|---|
| [run/session.ts](run/session.ts) | One room: join, leave, reconnect, inputs, start, play again, and the step that runs every system | `favyabils234-hash` (#82) |
| [run/phases.ts](run/phases.ts) | Lobby → playing → won/lost; win at 1800 distance, lose at 0 hull | `favyabils234-hash` (#52) |
| [run/presence.ts](run/presence.ts) | Disconnects keep the seat and drop the held item; leaving frees the seat | `favyabils234-hash` (#51) |
| [run/director.ts](run/director.ts) | Starts a breach or fire every 12 s (7 s late in the journey), scaled to the crew size | `favyabils234-hash` (#50, #53) |
| [run/courseTrigger.ts](run/courseTrigger.ts) | When the course hazard starts | `favyabils234-hash` (#136) |
| [run/random.ts](run/random.ts) | The seeded random source | `favyabils234-hash` (#50) |
| [journey/journey.ts](journey/journey.ts) | Fuel drains, speed follows fuel (and stops on an engine fire), distance grows, hazards wear the hull. **Owns all continuous hull damage** | `Abmuminfav` (#102) |
| [items/items.ts](items/items.ts) | Pick up the nearest item, one at a time, drop where you stand; two players grabbing one item: first request wins | `Abmuminfav` (#123) |

### Lobby
| File | What it does | By |
|---|---|---|
| [run/lobby.ts](run/lobby.ts) | The host (first to join, handed on when they leave), crew size 2–4, full room, `canDepart` | `Abmuminfav` (#162) |
| [run/boarding.ts](run/boarding.ts) | Walking on the platform (`stepLobby`), boarding the train when the host departs, back to the platform after play again | `Abmuminfav` (#182) |

### Hazards and stations
| File | What it does | By |
|---|---|---|
| [hazards/breach.ts](hazards/breach.ts) | Hold a wrench at a breach for 3 s to repair it | `davidudo2005` (#111), notes in [BREACH.md](hazards/BREACH.md) |
| [hazards/fire.ts](hazards/fire.ts) | Hold an extinguisher at a fire for 2.5 s; an engine fire stalls the train | `davidudo2005` (#122), [FIRE.md](hazards/FIRE.md) |
| [hazards/course.ts](hazards/course.ts) | Course warning: hold the steering console in the last 2 s or lose 12 hull | `davidudo2005`, [COURSE.md](hazards/COURSE.md) |
| [hazards/spread.ts](hazards/spread.ts) | A fire left for 15 s spreads to the nearest free spot | `davidudo2005` (#129), [SPREAD.md](hazards/SPREAD.md) |
| [stations/coal.ts](stations/coal.ts) | Take coal at the dispenser; deliver it at the engine for +35 fuel | `davidudo2005` (#108), [README.md](stations/README.md) |
| [stations/platform.ts](stations/platform.ts) | Departure lever, practice coal and boiler, practice breach, how-to-play boards | `davidudo2005` (#169), [PLATFORM.md](stations/PLATFORM.md) |

## Order of the rule systems in a run

The session runs its systems in this order on every step, then the hazard director, then the win/lose check:

1. **movement**: `stepMovement(state, inputDirections(frame.inputs), dt, trainMap)`
2. **journey**: `journeySystem` (fuel, speed, distance, all hull damage)
3. **breaches**: `breachSystem` (repair only)
4. **fires**: `fireSystem` (extinguish only)
5. **course** and **spread**, when enabled

Hull damage is counted **once**, in the journey. The hazard rules only handle repairs, so running them together never doubles the damage (see the reviews on #111 and #122).

## Tests

Every module has a `*.test.ts` next to it. Run them from `games/team-3/` with `npm test`. Besides checking the rules, several tests play a real session on the real map (walk through doors, fetch coal and refuel, board the train from the platform), and the key rules were checked by breaking them on purpose and confirming the tests fail.
