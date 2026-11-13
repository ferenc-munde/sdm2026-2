# Team-3 client app

Browser code for **The Last Train**. What is in this folder today:

| File | What it does | Issue |
|---|---|---|
| `index.html` | Page shell and styling | #10 |
| `main.ts` | Entry point: renderer, demo crew, camera on resize, HUD, keyboard readout, screens, scenery | #10, #11, #20, #21, #25 |
| `trainScene.ts` | Three.js scene: floors, walls, doors, coloured players with names | #10 |
| `trainMap.ts` | Temporary three-car layout until the shared map lands (#6) | #10 |
| `renderPlayer.ts` | The part of `Player` the renderer reads | #10 |
| `hudModel.ts` | Journey numbers → bar widths, fuel colour, displayed values (pure, tested) | #20 |
| `hud.ts` | Creates the three HUD bars once and updates their width and colour | #20 |
| `keyboard.ts` | Keys → `input` message: WASD/arrows, Space/E to interact | #11 |
| `screens.ts` | Win and lose screens, shown from `state.phase`, with "play again" | #21 |
| `scenery.ts` | Ground and sleepers that scroll past the train at `journey.speedFactor` | #25 |
| `sound.ts` | Event → sound mapping (hazard, repair, low fuel, win, lose), Web Audio player and mute button | #31 |
| `vite.config.ts` | Vite config for this app only | #10 |
| `docs/*.jpg` | Screenshots used in the PRs | #10, #11, #20, #21, #25 |

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm test
npm run typecheck
```

## Not here yet

- **Lobby** (#12): name entry, create/join a room by code, showing server errors.
- **Screens and effects** (#19): hazard drawing.

The client draws the state it receives and sends inputs; it never changes the game state itself.
