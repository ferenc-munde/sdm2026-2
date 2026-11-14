# client/

Browser code. Vite serves this folder (`index.html` is the page).

- `main.ts`: wires the page together: picks the session (networked, or offline with `?local`), keyboard → inputs, HUD and scene updates, lobby handover
- `net.ts`: networked session: creates or joins the platform game room through `@sdm/core/client`
- `stateModel.ts`: offline session: runs the rules from `shared/` in the browser; also defines the `GameSession` shape both sessions share
- `lobby.ts`, `lobby.css`: lobby screen (room `train_lobby`)
- `scene.ts`: Three.js top-down scene: scrolling landscape, train artwork, one marker per player from the game state
- `train-map.ts`: artwork data (carriage names, colours, station positions); the geometry the rules need is in `../shared/map.ts`
- `hud.ts`, `hud.css`: task checklist, gauges, journey strip (#65, #78)
- `state-to-hud.ts`: read-only mapping from game state to HUD values
- `styles.css`: page layout and demo controls
- `vite-env.d.ts`: types for `import.meta.env` (`VITE_SERVER_URL`)
- `hud-preview.html`, `preview-hud.mjs`: standalone HUD preview (`node client/preview-hud.mjs`)
- `HUD.md`, `MAP.md`: notes from the HUD and map issues
- `*.test.ts`: unit tests

Not built yet: minigame panels (#76), camera following the local player, interpolation. See [`../docs/NEXT_STEPS.md`](../docs/NEXT_STEPS.md).
