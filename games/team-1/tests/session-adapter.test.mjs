import assert from "node:assert/strict";
import { MockSessionAdapter, SessionError } from "../client/session-adapter.mjs";

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

await test("creates a local session with its host as the first connected player", async () => {
  const host = new MockSessionAdapter();
  const session = await host.createSession("  Ada   Lovelace ");
  assert.match(session.code, /^[A-Z0-9]{4}$/);
  assert.equal(session.playerId, session.players[0].id);
  assert.deepEqual(session.players.map(({ name, connected }) => ({ name, connected })), [
    { name: "Ada Lovelace", connected: true },
  ]);
});

await test("join and leave events update other lobby clients", async () => {
  const host = new MockSessionAdapter();
  const guest = new MockSessionAdapter();
  const events = [];
  host.subscribe((event) => events.push(`${event.type}:${event.player.name}`));
  const { code } = await host.createSession("Conductor");
  await guest.joinSession(code.toLowerCase(), "Signal Keeper");
  await guest.leaveSession();
  assert.deepEqual(events, ["player-joined:Signal Keeper", "player-left:Signal Keeper"]);
});

await test("enforces the four-player limit", async () => {
  const players = Array.from({ length: 5 }, () => new MockSessionAdapter());
  const { code } = await players[0].createSession("Player 1");
  await players[1].joinSession(code, "Player 2");
  await players[2].joinSession(code, "Player 3");
  await players[3].joinSession(code, "Player 4");
  await assert.rejects(players[4].joinSession(code, "Player 5"), (error) => {
    assert.ok(error instanceof SessionError);
    assert.equal(error.code, "SESSION_FULL");
    return true;
  });
});

await test("reports invalid names and unknown room codes", async () => {
  const client = new MockSessionAdapter();
  await assert.rejects(client.createSession("   "), { code: "INVALID_NAME" });
  await assert.rejects(client.joinSession("NOPE", "Passenger"), { code: "NOT_FOUND" });
});

await test("rejects a second room until leaving the current one", async () => {
  const host = new MockSessionAdapter();
  const guest = new MockSessionAdapter();
  const { code } = await host.createSession("Engineer");
  await assert.rejects(host.joinSession(code, "Engineer"), { code: "ALREADY_IN_SESSION" });
  await guest.joinSession(code, "Passenger");
  await host.leaveSession();
  const lateGuest = await new MockSessionAdapter().joinSession(code, "Late guest");
  assert.deepEqual(lateGuest.players.map((player) => player.name), ["Passenger", "Late guest"]);
});

console.log(`${passed}/${passed + failures.length} lobby adapter tests passed.`);
export const testResult = { passed, failed: failures.length };
if (failures.length > 0) throw new AggregateError(failures.map(({ error }) => error), "Lobby adapter tests failed.");
