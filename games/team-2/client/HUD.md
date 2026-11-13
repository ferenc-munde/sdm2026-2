# HUD handoff

Run the independent example from `games/team-2/`:

```powershell
node client/preview-hud.mjs
```

Open http://127.0.0.1:5174/. Restart that command after changing HUD files.
All preview buttons change example data only. The countdown advances with
the preview button, not a real clock.

## Connect to the game (base owner)

Import `createHud` from `./hud` and import `./hud.css` in the Vite client.
Create the HUD once with a dedicated container, then call its update methods
when network state changes:

```ts
const hud = createHud(container);
hud.updateTasks(Array.from(state.tasks, ([id, task]) => ({
  id, title: task.title, current: task.current, target: task.target,
})));
hud.updateGauges({ power: state.power, pressure: state.pressure });
hud.updateJourney({
  distance: state.journeyDistance,
  remainingSeconds, // derive from authoritative run elapsed ticks
  totalSeconds,     // configured time limit
  phase: state.phase,
  reason,           // optional end-screen explanation
});
// When leaving the game:
hud.destroy();
```

Remaining time must use elapsed ticks since the run started, not room age.
The HUD never decides victory, defeat, task completion, or train speed.
Reaching 100% distance alone does not show victory: the game must send `won`.
HUD overlays let pointer events pass through to the Three.js scene.

## Manual check

- Tasks: complete, remove, and reset; verify no duplicate rows.
- Gauges: try 0 and 100; low power warning below 15, overload at 100.
- Journey: travel, then use time; verify train and pace marker move.
- End screens: preview victory and defeat, then reset to hide the screen.
- Resize the browser to check the stacked layout.

The preview does not test multiplayer or the Three.js integration.

## Moving scene handoff

`createTrainScene(container)` returns `setSpeed(multiplier)`,
`setPaused(boolean)`, and `destroy()`. The scenery scrolls beneath a stationary
train and crew. Speed 1 means 120 artwork pixels per second, 0 stops motion.
This is a visual scale, not the simulation's units: the rules owner should map
authoritative train speed to a suitable multiplier at the client boundary.
No shared state, gameplay formulas, or task rules are changed by this API.

`client/main.ts` currently provides demo speed/pause controls. Replace their
example inputs with network state when the platform connection is ready.
The integrated startup now defaults to **Local rules**, using `stateModel.ts`
and the read-only `state-to-hud.ts` mapping. **Scene preview** keeps example
controls isolated from the real local state. Vite serves `client/index.html`;
the package-root HTML is a compatible alternate entry, not the scripted root.
Victory and defeat stop visual movement. The demo does not automatically
advance journey distance or countdown; those remain explicit preview controls.

Current coordination: Shahd owns the base and HUD; Rawan owns the lobby;
Ahmed and Zeyad own game rules and tasks. This handoff does not change the
shared interfaces or implement those teammates' features.
