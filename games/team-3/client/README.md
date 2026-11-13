# `client/`

Browser code: canvas drawing, keyboard input, the lobby and the heads-up display. It connects to the room with `@colyseus/sdk` once the platform host exists.

Owner: Developer 3. The client draws the state it receives and sends inputs; it never changes the game state itself.
