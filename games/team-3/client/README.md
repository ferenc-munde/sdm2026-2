# `client/`

Browser code: the Three.js scene, keyboard input, the lobby and the heads-up display. The platform team asked every game to render with [Three.js](https://threejs.org/); `three` is already a dependency of this package. It connects to the room with `@colyseus/sdk` once the platform host exists.

Owner: Developer 3. The client draws the state it receives and sends inputs; it never changes the game state itself.
