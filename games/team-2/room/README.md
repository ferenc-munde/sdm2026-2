# room/

Room registration lives here: `{ game: (deps) => createGameRoom(lastTrain, deps) }`.

Filled in with the shared contract (#64); the host shell comes from
`@sdm/host` (`createGameRoom`) once the platform lands, or a local Colyseus
room in the meantime.
