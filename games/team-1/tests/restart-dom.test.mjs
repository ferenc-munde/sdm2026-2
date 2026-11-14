import assert from "node:assert/strict";
import { createServer } from "node:net";
import { Window } from "happy-dom";
import { createTestViteServer } from "./helpers/vite-loader.mjs";

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
const browser = new Window({ url: "http://localhost/" });
browser.document.body.innerHTML = '<main id="app" class="shell"></main>';
globalThis.window = browser;
globalThis.document = browser.document;
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};

const vite = await createTestViteServer();
const { startGameServer, createLogger } = await vite.ssrLoadModule("@sdm/host");
const { rooms } = await vite.ssrLoadModule("/room/index.ts");
const { default: config } = await vite.ssrLoadModule("/config/game.json");
const logger = createLogger({ env: "local", sha: "test", game: "team-1" }, () => undefined);
const server = await startGameServer({
  gameId: "team-1",
  config: { ...config, conditionDecayPerSecond: 100 },
  rooms,
  port,
  logger,
});

async function waitFor(check, label, ms = 5000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

try {
  await vite.ssrLoadModule("/client/main.ts");
  const app = browser.document.querySelector("#app");
  app.querySelector("#host-name").value = "Conductor";
  app.querySelector("#create-session").click();
  await waitFor(() => !app.querySelector("#crew-room").hidden, "a live crew room");
  app.querySelector("#board-train").click();
  await waitFor(() => !app.querySelector("#game-screen").hidden, "gameplay after boarding");
  await waitFor(() => !app.querySelector("#outcome-overlay").hidden, "the synchronized failure result");
  assert.equal(app.querySelector("#outcome-overlay").dataset.tone, "failure");

  app.querySelector("#outcome-return").click();
  assert.equal(app.querySelector("#game-screen").hidden, true);
  assert.equal(app.querySelector("#crew-room").hidden, false);
  app.querySelector("#board-train").click();
  await waitFor(() => !app.querySelector("#game-screen").hidden, "the restarted run");
  await waitFor(() => app.querySelector("#outcome-overlay").hidden === true, "the reset result overlay");
  const restartedCondition = Number.parseInt(app.querySelector("#condition-value").textContent, 10);
  assert.ok(restartedCondition < 100 && restartedCondition > 80, "the restarted train recovers to near-full condition");
  assert.equal(app.querySelector("#repair-count").textContent, "0 / 3");
  assert.ok([...app.querySelectorAll("#task-list .task-row")].every((row) => row.querySelector(".task-track > span").style.width === "0%"));
  console.log("PASS returning to crew and restarting resets the authoritative run");
} finally {
  browser.dispatchEvent(new browser.Event("pagehide"));
  await new Promise((resolve) => setTimeout(resolve, 100));
  await server.shutdown();
  await vite.close();
  await browser.happyDOM.close();
}
