# room/

Room registration lives here: `{ game: (deps) => createGameRoom(lastTrain, deps) }`.

The room shell is the platform's `createGameRoom()` from `@sdm/host` — never a
local Colyseus implementation (root `CLAUDE.md`, `server/CLAUDE.md`).
This file's content is added with the shared contract (#64); the host
package itself is tracked with the platform in #73.
