# `@sdm/template`

The reference game: the smallest playable multiplayer game on the platform. Each team copies it to `games/team-N/` to start, then renames it (`@team-N/game`, `GAME_ID = "team-N"`).

Layout of a game package (the template and every `games/team-N/`):

```
games/team-N/
├─ package.json      @team-N/game
├─ server.ts         calls startGameServer() from @sdm/host
├─ index.html        the client page
├─ vite.config.ts    Vite build for the client
├─ client/           browser code: rendering, input, connecting with @colyseus/sdk
├─ room/             room registration: { game: (deps) => createGameRoom(myGame, deps) }
├─ shared/           browser-safe game rules (GameDefinition), state, input and config schemas
└─ config/game.json  tickRate, patchRate, maxPlayers, reconnectSeconds and tuning values
```

The rules for writing a game are in [../CLAUDE.md](../CLAUDE.md#writing-a-game-the-game-definition).
