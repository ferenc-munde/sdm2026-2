# Issue #37: five-carriage top-down map

## Player camera (#377)

Normal play now follows the local session player, showing approximately two
carriages in the viewport below the HUD. The vertical target follows the
player's actual position (including passages); the horizontal centre stays
on the train so the entire carriage width remains visible. Camera motion is
smoothed on the render loop; reduced-motion users get direct positioning.
The first/last-car framing is clamped to map bounds. No local player means
an overview until that player's state arrives; remote players never become
the follow target implicitly.

Developer inspection (`?local&debug=1`) has a **Follow my player** option,
plus the existing whole-train and individual-car views. Explicit inspection
temporarily overrides following; selecting Follow restores it. Player/item
visual modules and shared movement rules are unchanged.

Try `?local`, continue past the briefing and move with WASD/arrows. Walk
through several passages, then resize the window. Repeat in two networked
clients: each camera must follow its own player. Automated tests cover local
id selection, map edges, desktop/narrow framing and frame-rate-independent
camera smoothing; browser visual inspection still needs a human check.

Start with `pnpm dev` from `games/team-2/`. The default view shows the
whole train. Use **Inspect map** to zoom into any carriage and its neighbours.
The vertical layout follows the team's supplied 2D reference; the older SPEC
describes a horizontal arrangement. Car ordering and station contents follow
SPEC section 2.

## Layout

1. Command & Guidance: dual navigation consoles, emergency brake, route map.
2. Boiler: boiler, intake valves, furnace fuel slot.
3. Mechanical Junction: breaker, pipes, coolant pump, wrench and extinguisher lockers.
4. Cargo: coal, parts, battery bins, spare fuses, extinguisher refill.
5. Caboose / Generator: generator crank, lookout platform, track-switch lever.

Each car has a distinct floor palette, perimeter walls, lighting strips and
labelled equipment. Four open bulkheads join the central aisle; retracted
gold door leaves mark the openings. Small gold-marked floor hatches are the
visual placeholders for the SPEC's emergency relief route.

## Handoff

`client/train-map.ts` exports artwork bounds, station positions and passage
connections. Since #241 the carriage and passage geometry comes from
`shared/map.ts`, which the server also uses for movement bounds and spawn
points; station positions are still client-only. Coordinate system:
1600 x 1000, origin top-left, x right, y down. The camera uses the same artwork
through Three.js with an orthographic projection.

`createTrainScene().focusCar(index)` inspects a car; `focusCar(null)` shows
the whole train. Scrolling scenery and speed controls remain available.

Avatar movement and multiplayer arrived in #241 (`docs/PLATFORM.md`).
Task/minigame interactions, station collisions, animated door locking and
hatch traversal are separate integrations.
The map supplies their visual locations; it does not implement their rules.

## Validation

- Automated tests check five cars, four adjacent connections, unique station
  IDs, station containment and a clear central aisle.
- Build/typecheck and the complete test suite must pass.
- In the browser, inspect every car, verify readable station labels, check
  connections in overview and close-up, and resize the window.
- Actual player traversal and multiplayer are not tested by map checks.
