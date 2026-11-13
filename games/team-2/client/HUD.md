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
