# room/

Room registration for the platform host. `index.ts` exports the factories that
`server.ts` passes to `startGameServer()`:

```ts
export const rooms = {
  game: (deps) => createGameRoom(lastTrain, deps), // the game: the platform's room shell + our rules
  train_lobby: () => TrainLobbyRoom,               // the team's lobby (lobby-room.ts)
};
```

- **The game room is never a hand-written Colyseus room.** It is always the
  platform's `createGameRoom()` from `@sdm/host` running `lastTrain` from
  `shared/game.ts` (root `CLAUDE.md`, `server/CLAUDE.md`). Game rules go in
  `shared/`, not here.
- **The lobby room is the team's own Colyseus room** (`lobby-room.ts`): name,
  crew size, automatic start when full, and host departure. It holds no game rules. Players create
  private rooms or join them by the server-issued room code. After departure
  it passes the host's game room code on to the crew (message `game-room`).
- `room.test.ts` starts a real server and connects two real clients.

Details: [`../docs/PLATFORM.md`](../docs/PLATFORM.md).
