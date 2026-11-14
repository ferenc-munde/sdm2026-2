# Team-3 client app

Browser code for **The Last Train**. What is in this folder today:

| File | What it does | Issue |
|---|---|---|
| `index.html` | Page shell and styling | #10 |
| `main.ts` | Entry point: renderer, demo crew, camera on resize, HUD, keyboard readout, screens, scenery | #10, #11, #20, #21, #25 |
| `trainScene.ts` | Three.js scene from `shared/map/map.ts`: train, stations, players, items, hazards and repair bars | #10, #19 |
| `renderPlayer.ts` | The part of `Player` the renderer reads | #10 |
| `hudModel.ts` | Journey numbers → bar widths, fuel colour, displayed values (pure, tested) | #20 |
| `hud.ts` | Creates the three HUD bars once and updates their width and colour | #20 |
| `keyboard.ts` | Keys → `input` message: WASD/arrows, Space/E to interact | #11 |
| `lobbyModel.ts` | Main menu logic: name/code validation, error copy, share links (pure, tested) | #12 |
| `lobby.ts` | Main menu screen: name, create room, join with a code, error line, room code | #12 |
| `platformScene.ts` | Three.js platform for the waiting room: floor, walls, objects and crew | #146 |
| `waitingRoomModel.ts` | Waiting room logic: crew, host, crew-size options, departure (pure, tested) | #146 |
| `waitingRoom.ts` | Waiting room screen: crew list, crew size, ticket with copy link, Depart | #146 |
| `courseFx.ts` | Course-failure feedback: detect the failed event, camera shake and hull tilt (pure, tested) | #219 |
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

- **Connected client** (#145/#80): the socket that turns these messages into a live room; until then the waiting room runs on a mock crew.

The client draws the state it receives and sends inputs; it never changes the game state itself.
