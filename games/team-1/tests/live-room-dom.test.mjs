// The lobby page in live mode (no `?mock`) against a real game server on a free port (issue #240).
// The page is the host; a second player joins through the same room adapters the page uses.
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { Window } from "happy-dom";
import { createTestViteServer } from "./helpers/vite-loader.mjs";

// The page reads the server address from VITE_SERVER_URL, so the port must be known before Vite starts.
const port = await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once("error", reject);
  probe.listen(0, () => {
    const { port: free } = probe.address();
    probe.close(() => resolve(free));
  });
});
const address = { http: `http://localhost:${port}`, ws: `ws://localhost:${port}` };
process.env.VITE_SERVER_URL = address.http;

const vite = await createTestViteServer();
const { startGameServer, createLogger } = await vite.ssrLoadModule("@sdm/host");
const { rooms } = await vite.ssrLoadModule("/room/index.ts");
const { default: config } = await vite.ssrLoadModule("/config/game.json");
const logger = createLogger({ env: "local", sha: "test", game: "team-1" }, () => undefined);
const server = await startGameServer({ gameId: "team-1", config, rooms, port, logger });

const browser = new Window({ url: "http://localhost/" });
browser.document.body.innerHTML = '<main id="app" class="shell"></main>';
globalThis.window = browser;
globalThis.document = browser.document;
// Frames run only when the test asks for one.
const frames = new Map();
let nextFrameId = 1;
globalThis.requestAnimationFrame = (callback) => {
  frames.set(nextFrameId, callback);
  return nextFrameId++;
};
globalThis.cancelAnimationFrame = (id) => frames.delete(id);
function runFrame() {
  const pending = [...frames.values()];
  frames.clear();
  for (const callback of pending) callback(performance.now());
}

async function waitFor(check, label, ms = 5000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

let guest;
try {
  const { createRoomAdapters } = await vite.ssrLoadModule("/client/room-adapters.ts");
  await vite.ssrLoadModule("/client/main.ts");
  const app = browser.document.querySelector("#app");

  assert.equal(app.querySelector(".preview-note").hidden, true, "the mock note is hidden in live mode");

  app.querySelector("#host-name").value = "Conductor";
  app.querySelector("#create-session").click();
  await waitFor(() => !app.querySelector("#crew-room").hidden, "the crew room");
  const roomCode = app.querySelector("#active-code").textContent;
  assert.match(roomCode, /^[A-Z0-9]{4}$/);
  assert.equal(app.querySelector("#room-capacity").textContent, "1 / 4 CREW ABOARD");
  console.log("PASS the lobby creates a platform room and shows its code");

  guest = createRoomAdapters(address);
  const joined = await guest.session.joinSession(roomCode, "Signal Keeper");
  assert.equal(joined.code, roomCode);
  assert.deepEqual(joined.players.map((player) => player.name), ["Conductor", "Signal Keeper"]);
  await waitFor(() => app.querySelectorAll("#player-list .player-row:not(.player-empty)").length === 2, "the second crew member");
  assert.match(app.querySelector("#player-list").textContent, /Signal Keeper/);
  console.log("PASS a second player joins by the shown code and appears in the lobby");

  assert.equal(app.querySelector("#game-screen").hidden, true);
  app.querySelector("#board-train").click();
  await waitFor(() => !app.querySelector("#game-screen").hidden, "the game screen");
  await waitFor(() => guest.game.getSnapshot().phase === "playing", "the run to start for the guest");
  assert.equal(app.querySelector("#crew-count").textContent, "2 / 4");
  assert.equal(app.querySelector(".mock-controls"), null, "no mock controls in live mode");
  assert.equal(app.querySelector("#game-connection").textContent, "CONNECTED");
  console.log("PASS boarding the train starts the run through the room for everyone");

  // The page's keyboard input goes to the server; the guest sees the host move.
  const hostX = () => guest.game.getSnapshot().players[0].position.x;
  const guestX = () => guest.game.getSnapshot().players[1].position.x;
  const before = hostX();
  const guestBefore = guestX();
  browser.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "d" }));
  runFrame();
  await waitFor(() => hostX() > before + 0.03, "the host to move on the guest's screen");
  browser.dispatchEvent(new browser.KeyboardEvent("keyup", { key: "d" }));
  runFrame();
  assert.equal(guestX(), guestBefore, "only the player who pressed the key moved");
  console.log("PASS keyboard movement is applied by the server and seen by the other player");

  app.querySelector("#return-crew").click();
  assert.equal(app.querySelector("#game-screen").hidden, true);
  assert.equal(app.querySelector("#crew-room").hidden, false);
  await guest.session.leaveSession();
  await waitFor(() => app.querySelectorAll("#player-list .player-row:not(.player-empty)").length === 1, "the guest to leave");
  console.log("PASS leaving updates the lobby");
  console.log("5/5 live room DOM tests passed.");
} finally {
  await guest?.session.leaveSession().catch(() => undefined);
  browser.dispatchEvent(new browser.Event("pagehide"));
  await new Promise((resolve) => setTimeout(resolve, 100));
  await server.shutdown();
  await vite.close();
  await browser.happyDOM.close();
}
