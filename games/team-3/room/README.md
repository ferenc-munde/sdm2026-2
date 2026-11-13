# `room/`

Room registration for the platform host. Once `@sdm/host` exists, `room/index.ts` registers the game as a factory:

```ts
export const rooms = { game: (deps) => createGameRoom(lastTrain, deps) };
```

Owner: Developer 2. Nothing here may contain game rules; those live in `shared/`.
