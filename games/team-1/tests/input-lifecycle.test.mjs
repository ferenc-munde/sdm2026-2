import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { createTestViteServer } from "./helpers/vite-loader.mjs";

const browser = new Window({ url: "http://localhost/" });
globalThis.window = browser;
globalThis.document = browser.document;
const vite = await createTestViteServer();
try {
  const { InputHandler } = await vite.ssrLoadModule("/client/input/InputHandler.ts");
  const { RoomInputController } = await vite.ssrLoadModule("/client/room-input-controller.ts");
  let passed = 0;

  function test(name, run) {
    run();
    passed += 1;
    console.log(`PASS ${name}`);
  }

  const send = [];
  const controller = new RoomInputController({ sendInput: (input) => send.push(input) });
  const dispatchKey = (target, type, key, options = {}) => target.dispatchEvent(new browser.KeyboardEvent(type, { key, bubbles: true, ...options }));

  test("movement still sends server input and stops immediately on browser blur", () => {
    dispatchKey(browser, "keydown", "d");
    controller.update();
    assert.deepEqual(send.at(-1), { type: "move", x: 1, z: 0 });
    browser.dispatchEvent(new browser.Event("blur"));
    assert.deepEqual(send.at(-1), { type: "move", x: 0, z: 0 });
    const messageCount = send.length;
    controller.update();
    assert.equal(send.length, messageCount, "cleared movement is not re-sent every frame");
  });

  test("hidden-tab visibility changes clear all held directions", () => {
    dispatchKey(browser, "keydown", "w");
    controller.update();
    assert.deepEqual(send.at(-1), { type: "move", x: 0, z: -1 });
    Object.defineProperty(browser.document, "visibilityState", { configurable: true, value: "hidden" });
    browser.document.dispatchEvent(new browser.Event("visibilitychange"));
    assert.deepEqual(send.at(-1), { type: "move", x: 0, z: 0 });
    Object.defineProperty(browser.document, "visibilityState", { configurable: true, value: "visible" });
  });

  test("movement and E are ignored while typing in inputs or contenteditable elements", () => {
    const input = browser.document.createElement("input");
    const editor = browser.document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    browser.document.body.append(input, editor);
    const previousInputCount = send.length;
    dispatchKey(input, "keydown", "d");
    dispatchKey(input, "keydown", "e");
    controller.update();
    assert.equal(send.length, previousInputCount);
    dispatchKey(editor, "keydown", "e");
    assert.equal(send.length, previousInputCount);
    dispatchKey(browser, "keydown", "e");
    assert.deepEqual(send.at(-1), { type: "repair" });
    input.remove();
    editor.remove();
  });

  test("dispose sends a final stop and unregisters keyboard controls", () => {
    dispatchKey(browser, "keydown", "a");
    controller.update();
    assert.deepEqual(send.at(-1), { type: "move", x: -1, z: 0 });
    controller.dispose();
    assert.deepEqual(send.at(-1), { type: "move", x: 0, z: 0 });
    const messageCount = send.length;
    dispatchKey(browser, "keydown", "e");
    dispatchKey(browser, "keydown", "d");
    controller.update();
    assert.equal(send.length, messageCount);
  });

  console.log(`${passed}/4 input lifecycle tests passed.`);
} finally {
  await vite.close();
  await browser.happyDOM.close();
}
