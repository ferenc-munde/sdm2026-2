# Team 1 frontend

This package starts with the lobby screen and keeps its room client behind `client/session-adapter.ts`. The current `MockSessionAdapter` stores sessions in memory in one page runtime only. It is a local UI preview, not multiplayer networking; the page labels it as a mock. Replace it with an adapter for the platform's confirmed client contract when that contract is available.

The lobby is a standalone DOM screen and does not own or create a Three.js renderer. A future game view can mount its renderer after the lobby hands off a connected session, without coupling Three.js objects to lobby state.

## Commands

- `npm install`
- `npm run dev`
- `npm test`
- `npm run build`
