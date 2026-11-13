# Team 1 frontend

This package starts with the lobby screen and keeps its room client behind the typed adapter contract in `client/session-adapter.d.mts`, implemented locally by `client/session-adapter.mjs`. The `MockSessionAdapter` stores sessions in memory in one page runtime only. The join form includes a `DEMO` fixture to preview the guest flow. It is local UI state, not multiplayer networking; the page labels it as a mock. Replace it with an adapter for the platform's confirmed client contract when that contract is available.

The lobby is a standalone DOM screen and does not own or create a Three.js renderer. A game view can mount a renderer after the lobby hands off a connected session, without coupling Three.js objects to lobby state.

Issue #62 adds the `GameStateAdapter` boundary and a separate `MockGameStateAdapter`. Its snapshots model players, countdown, train condition, repair tasks, and outcomes for UI work. The mock only publishes snapshots supplied by the preview; it does not simulate authoritative rules or connect to other browsers.

## Commands

- `npm install`
- `npm run dev`
- `npm test`
- `npm run build`
