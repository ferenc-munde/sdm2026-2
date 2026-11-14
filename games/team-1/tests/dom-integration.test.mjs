import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Window } from "happy-dom";
import { createTestViteServer } from "./helpers/vite-loader.mjs";

// `?mock` selects the in-memory adapters; without it the page connects to a game server.
const browser = new Window({ url: "http://localhost/?mock" });
browser.document.body.innerHTML = '<main id="app" class="shell"></main>';
globalThis.window = browser;
globalThis.document = browser.document;
const animationFrames = new Map();
let nextAnimationFrameId = 1;
globalThis.requestAnimationFrame = (callback) => {
  const id = nextAnimationFrameId++;
  animationFrames.set(id, callback);
  return id;
};
globalThis.cancelAnimationFrame = (id) => animationFrames.delete(id);

const vite = await createTestViteServer();
try {
  await vite.ssrLoadModule("/client/main.ts");
  const app = browser.document.querySelector("#app");
  const tick = async () => {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  let passed = 0;
  const failures = [];
  async function test(name, run) {
    try {
      await run();
      passed += 1;
      console.log(`PASS ${name}`);
    } catch (error) {
      failures.push({ name, error });
      console.error(`FAIL ${name}: ${error.message}`);
    }
  }

  await test("HTML loads the single TypeScript application entry point", async () => {
    const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
    assert.match(html, /<main id="app"/);
    assert.match(html, /src="\/client\/main\.ts"/);
    assert.doesNotMatch(html, /src="\/client\/main\.js"/);
  });

  await test("lobby DOM connects, announces player changes, enforces visible seats, and recovers from errors", async () => {
    app.querySelector("#join-name").value = "Passenger";
    app.querySelector("#room-code").value = "NOPE";
    app.querySelector("#join-session").click();
    await tick();
    assert.match(app.querySelector("#feedback").textContent, /code was not found/i);
    assert.equal(app.querySelector("#feedback").dataset.kind, "error");

    app.querySelector("#host-name").value = "Conductor";
    app.querySelector("#create-session").click();
    await tick();
    const roomCode = app.querySelector("#active-code").textContent;
    assert.match(roomCode, /^[A-Z0-9]{4}$/);
    assert.equal(app.querySelector("#crew-room").hidden, false);
    assert.equal(app.querySelectorAll("#player-list .player-row").length, 4);
    assert.equal(app.querySelector("#room-capacity").textContent, "1 / 4 CREW ABOARD");

    const { MockSessionAdapter } = await vite.ssrLoadModule("/client/session-adapter.mjs");
    const guest = new MockSessionAdapter();
    await guest.joinSession(roomCode, "Signal Keeper");
    await tick();
    assert.equal(app.querySelectorAll("#player-list .player-row:not(.player-empty)").length, 2);
    assert.match(app.querySelector("#feedback").textContent, /Signal Keeper joined/);
    await guest.leaveSession();
    await tick();
    assert.equal(app.querySelectorAll("#player-list .player-row:not(.player-empty)").length, 1);
    assert.match(app.querySelector("#feedback").textContent, /Signal Keeper left/);

    app.querySelector("#leave-session").click();
    await tick();
    assert.equal(app.querySelector("#crew-room").hidden, true);
    assert.match(app.querySelector("#feedback").textContent, /left the crew/i);

    app.querySelector("#join-name").value = "Preview Passenger";
    app.querySelector("#room-code").value = "demo";
    app.querySelector("#join-session").click();
    await tick();
    assert.equal(app.querySelector("#active-code").textContent, "DEMO");
    assert.equal(app.querySelectorAll("#player-list .player-row:not(.player-empty)").length, 2);
  });

  await test("roster events keep gameplay active and returning shows the latest crew", async () => {
    const { MockSessionAdapter } = await vite.ssrLoadModule("/client/session-adapter.mjs");
    const guest = new MockSessionAdapter();
    app.querySelector("#board-train").click();
    try {
      assert.equal(app.querySelector("#crew-room").hidden, true);
      await guest.joinSession("DEMO", "Late Passenger");
      await tick();
      assert.equal(app.querySelector("#crew-room").hidden, true);
      assert.equal(app.querySelector("#game-screen").hidden, false);
      assert.equal(app.querySelector("#crew-count").textContent, "3 / 4");
      await guest.leaveSession();
      await tick();
      assert.equal(app.querySelector("#crew-room").hidden, true);
      assert.equal(app.querySelector("#crew-count").textContent, "2 / 4");
    } finally {
      await guest.leaveSession();
      app.querySelector("#return-crew").click();
    }
    assert.equal(app.querySelector("#crew-room").hidden, false);
    assert.equal(app.querySelector("#game-screen").hidden, true);
    assert.equal(app.querySelector("#room-capacity").textContent, "2 / 4 CREW ABOARD");
    assert.doesNotMatch(app.querySelector("#player-list").textContent, /Late Passenger/);
  });

  await test("HUD DOM reflects snapshots and displays both terminal results", async () => {
    const { mountGameplayView } = await vite.ssrLoadModule("/client/gameplay-view.ts");
    const { MockGameStateAdapter, createPreviewSnapshot } = await vite.ssrLoadModule("/client/game-state-adapter.mjs");
    const root = browser.document.createElement("section");
    browser.document.body.append(root);
    const adapter = new MockGameStateAdapter(createPreviewSnapshot([
      { id: "p1", name: "Engineer", connected: true },
    ]));
    const sceneSnapshots = [];
    let sceneDisposed = false;
    let exited = false;
    const dispose = mountGameplayView(root, adapter, {
      roomCode: "DEMO",
      onExit: () => { exited = true; },
      onPreviewAction: () => {},
      createScene: () => ({ update: (snapshot) => sceneSnapshots.push(snapshot), dispose: () => { sceneDisposed = true; } }),
    });

    assert.equal(root.querySelector("#countdown").textContent, "03:00");
    assert.equal(root.querySelector("#crew-count").textContent, "1 / 4");
    assert.equal(root.querySelector("#outcome-overlay").hidden, true);

    adapter.publish({
      ...adapter.getSnapshot(),
      connectionState: "reconnecting",
      secondsRemaining: 19,
      trainCondition: 42,
      repairs: { completed: 1, total: 3 },
      tasks: [{ id: "wires", label: "Reconnect signal wires", status: "in-progress", progress: 55 }],
      players: [{ ...adapter.getSnapshot().players[0], connected: false }],
    });
    assert.equal(root.querySelector("#countdown").textContent, "00:19");
    assert.equal(root.querySelector("#countdown").classList.contains("is-urgent"), true);
    assert.equal(root.querySelector("#condition-value").textContent, "42%");
    assert.equal(root.querySelector("#condition-meter").getAttribute("aria-valuenow"), "42");
    assert.equal(root.querySelector("#repair-count").textContent, "1 / 3");
    assert.match(root.querySelector("#task-list").textContent, /Reconnect signal wires/);
    assert.equal(root.querySelector("#task-list .task-status").textContent, "IN PROGRESS");
    assert.equal(root.querySelector("#game-connection").textContent, "RECONNECTING");
    assert.match(root.querySelector("#game-players").textContent, /RECONNECTING/);
    assert.equal(sceneSnapshots.length, 2);

    adapter.publish({ ...adapter.getSnapshot(), outcome: { kind: "victory", message: "The crew arrived safely." } });
    const overlay = root.querySelector("#outcome-overlay");
    assert.equal(overlay.hidden, false);
    assert.equal(overlay.dataset.tone, "victory");
    assert.equal(root.querySelector("#outcome-title").textContent, "THE LINE HOLDS");
    assert.equal(root.querySelector("#outcome-message").textContent, "The crew arrived safely.");

    adapter.publish({ ...adapter.getSnapshot(), outcome: { kind: "failure", message: "The engine stalled." } });
    assert.equal(overlay.dataset.tone, "failure");
    assert.equal(root.querySelector("#outcome-title").textContent, "THE TRAIN HAS STALLED");
    assert.equal(root.querySelector("#outcome-message").textContent, "The engine stalled.");
    root.querySelector("#outcome-return").click();
    assert.equal(exited, true);

    dispose();
    assert.equal(sceneDisposed, true);
    assert.equal(root.childElementCount, 0);
  });

  await test("page exit disposes the player controller and gameplay view", async () => {
    app.querySelector("#board-train").click();
    assert.ok(animationFrames.size > 0);
    browser.dispatchEvent(new browser.Event("pagehide"));
    assert.equal(animationFrames.size, 0);
    assert.equal(app.querySelector("#game-screen").childElementCount, 0);
  });

  console.log(`${passed}/${passed + failures.length} DOM integration tests passed.`);
  if (failures.length) throw new AggregateError(failures.map(({ error }) => error), "DOM integration tests failed.");
} finally {
  browser.dispatchEvent(new browser.Event("pagehide"));
  await vite.close();
  await browser.happyDOM.close();
}
