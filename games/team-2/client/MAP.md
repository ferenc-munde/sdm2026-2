# Issue #37: five-carriage top-down map

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
