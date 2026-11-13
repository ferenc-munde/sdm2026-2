# Coal stations — #15

`useCoalStation(state, playerId, station)` returns a new state on successful use,
otherwise the original state. Call it once per station-use input with a station
selected from the server's map, never a client-supplied station position.

Only connected players within `INTERACT_RANGE` can use it during play. The coal
dispenser creates one held coal for an empty-handed player. Using the engine
consumes held coal and adds 35 fuel, capped at 100. Item IDs are allocated from
unused `coal-N` keys. The input state is never mutated.

Room wiring and map station selection belong to their respective owners and are
not present in this repository snapshot. Do not route engine use through a
generic drop action before giving this function a chance to consume the coal.
