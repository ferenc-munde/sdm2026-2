# Team-3 client app

Browser code for **The Last Train**. What is in this folder today:

| File | What it does | Issue |
|---|---|---|
| `index.html` | Page shell and basic styling | #10 |
| `main.ts` | Entry point: creates the renderer, draws the demo crew, refits the camera on resize | #10 |
| `trainScene.ts` | Builds the Three.js scene: floors, walls, doors, coloured players with name labels | #10 |
| `trainMap.ts` | Temporary three-car layout until the shared map lands (#6) | #10 |
| `renderPlayer.ts` | The part of `Player` the renderer reads | #10 |
| `vite.config.ts` | Vite config for this app only | #10 |
| `hudModel.ts` | Journey numbers → bar widths, fuel colour, displayed values (pure, tested) | #20 |
| `hud.ts` | Creates the three HUD bars once and updates their width and colour | #20 |
| `docs/renderer.jpg`, `docs/hud.jpg` | Screenshots used in PR #61 and the HUD PR | #10, #20 |

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # vitest, whole package
npm run typecheck
```

## Not here yet

- **Keyboard input** (#11): read WASD/arrows and send the movement and interact inputs to the room.
- **Lobby** (#12): name entry, create/join a room by code, showing server errors.
- **Screens and effects** (#19, #21, #25, #31): hazard drawing, end screens, scrolling scenery, sound.

The client draws the state it receives and sends inputs; it never changes the game state itself.
